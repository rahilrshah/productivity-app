-- Migration: Add batch sync transaction support
-- Description: Creates RPC functions for atomic batch sync operations
-- This ensures all sync operations within a batch either succeed or fail together

-- Drop existing function if it exists (for idempotent migration)
DROP FUNCTION IF EXISTS batch_sync_changes(jsonb, uuid, text);

-- Create custom type for sync change
DROP TYPE IF EXISTS sync_change_type CASCADE;
CREATE TYPE sync_change_type AS (
  operation text,
  entity_type text,
  entity_id uuid,
  data jsonb,
  vector_clock jsonb
);

-- Create custom type for sync result
DROP TYPE IF EXISTS sync_result_type CASCADE;
CREATE TYPE sync_result_type AS (
  entity_id uuid,
  status text,
  error text
);

/**
 * Batch sync changes with transaction support
 *
 * This function processes multiple sync changes in a single database transaction.
 * If any operation fails, the entire batch is rolled back.
 *
 * @param changes - JSONB array of sync changes
 * @param p_user_id - The authenticated user's ID
 * @param p_device_id - The device ID making the sync request
 * @returns JSONB array of results for each change
 */
CREATE OR REPLACE FUNCTION batch_sync_changes(
  changes jsonb,
  p_user_id uuid,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  change_record jsonb;
  result_record jsonb;
  results jsonb := '[]'::jsonb;
  v_operation text;
  v_entity_type text;
  v_entity_id uuid;
  v_data jsonb;
  v_vector_clock jsonb;
  v_error text;
BEGIN
  -- Validate inputs
  IF changes IS NULL OR jsonb_array_length(changes) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  -- Limit batch size to prevent abuse
  IF jsonb_array_length(changes) > 100 THEN
    RAISE EXCEPTION 'Batch size exceeds maximum of 100 changes';
  END IF;

  -- Process each change within the transaction
  FOR change_record IN SELECT * FROM jsonb_array_elements(changes)
  LOOP
    BEGIN
      -- Extract change fields
      v_operation := change_record->>'operation';
      v_entity_type := change_record->>'entity_type';
      v_entity_id := (change_record->>'entity_id')::uuid;
      v_data := change_record->'data';
      v_vector_clock := change_record->'vector_clock';

      -- Validate required fields
      IF v_operation IS NULL OR v_entity_type IS NULL OR v_entity_id IS NULL THEN
        RAISE EXCEPTION 'Missing required fields in change record';
      END IF;

      -- Log the sync operation first
      INSERT INTO sync_log (
        user_id,
        device_id,
        operation,
        entity_type,
        entity_id,
        changes,
        vector_clock
      ) VALUES (
        p_user_id,
        p_device_id,
        v_operation,
        v_entity_type,
        v_entity_id,
        v_data,
        v_vector_clock
      );

      -- Process based on entity type
      IF v_entity_type = 'task' THEN
        PERFORM process_task_sync(v_operation, v_entity_id, v_data, p_user_id);
      ELSIF v_entity_type = 'user' THEN
        PERFORM process_user_sync(v_operation, v_entity_id, v_data, p_user_id);
      ELSE
        RAISE EXCEPTION 'Unknown entity type: %', v_entity_type;
      END IF;

      -- Add success result
      result_record := jsonb_build_object(
        'entity_id', v_entity_id,
        'status', 'success'
      );
      results := results || result_record;

    EXCEPTION WHEN OTHERS THEN
      -- On any error, the entire transaction will be rolled back
      -- due to the way PostgreSQL handles exceptions in transactions
      RAISE EXCEPTION 'Failed to process entity %: %', v_entity_id, SQLERRM;
    END;
  END LOOP;

  RETURN results;
END;
$$;

/**
 * Helper function to process task sync operations
 */
CREATE OR REPLACE FUNCTION process_task_sync(
  p_operation text,
  p_entity_id uuid,
  p_data jsonb,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_operation
    WHEN 'create' THEN
      INSERT INTO tasks (
        id,
        user_id,
        title,
        content,
        status,
        priority,
        due_date,
        tags,
        task_type,
        type_metadata,
        parent_id,
        root_id,
        position,
        node_type,
        category
      ) VALUES (
        p_entity_id,
        p_user_id,
        COALESCE(p_data->>'title', 'Untitled'),
        p_data->>'content',
        COALESCE(p_data->>'status', 'pending'),
        COALESCE((p_data->>'priority')::int, 5),
        (p_data->>'due_date')::timestamptz,
        COALESCE((p_data->'tags')::text[], ARRAY[]::text[]),
        COALESCE(p_data->>'task_type', 'todo'),
        COALESCE(p_data->'type_metadata', '{}'::jsonb),
        (p_data->>'parent_id')::uuid,
        (p_data->>'root_id')::uuid,
        COALESCE((p_data->>'position')::int, 0),
        COALESCE(p_data->>'node_type', 'item'),
        p_data->>'category'
      );

    WHEN 'update' THEN
      UPDATE tasks
      SET
        title = COALESCE(p_data->>'title', title),
        content = COALESCE(p_data->>'content', content),
        status = COALESCE(p_data->>'status', status),
        priority = COALESCE((p_data->>'priority')::int, priority),
        due_date = COALESCE((p_data->>'due_date')::timestamptz, due_date),
        tags = COALESCE((p_data->'tags')::text[], tags),
        task_type = COALESCE(p_data->>'task_type', task_type),
        type_metadata = COALESCE(p_data->'type_metadata', type_metadata),
        position = COALESCE((p_data->>'position')::int, position),
        updated_at = NOW()
      WHERE id = p_entity_id AND user_id = p_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found or access denied: %', p_entity_id;
      END IF;

    WHEN 'delete' THEN
      UPDATE tasks
      SET
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = p_entity_id AND user_id = p_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found or access denied: %', p_entity_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown operation: %', p_operation;
  END CASE;
END;
$$;

/**
 * Helper function to process user sync operations
 */
CREATE OR REPLACE FUNCTION process_user_sync(
  p_operation text,
  p_entity_id uuid,
  p_data jsonb,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Security: Users can only update their own data
  IF p_entity_id != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify other user data';
  END IF;

  CASE p_operation
    WHEN 'update' THEN
      UPDATE users
      SET
        display_name = COALESCE(p_data->>'display_name', display_name),
        preferences = COALESCE(p_data->'preferences', preferences),
        updated_at = NOW()
      WHERE id = p_user_id;

    ELSE
      RAISE EXCEPTION 'Unsupported user operation: %', p_operation;
  END CASE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION batch_sync_changes(jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION process_task_sync(text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION process_user_sync(text, uuid, jsonb, uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION batch_sync_changes IS 'Processes multiple sync changes atomically within a single transaction';
