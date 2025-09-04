'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  getAutomationEngine, 
  AutomationRule, 
  AutomationExecution,
  TriggerType,
  ActionType,
  AutomationTrigger,
  AutomationAction
} from '@/lib/automation'
import { 
  Zap,
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  History,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Bell,
  Tag,
  ArrowRight,
  BarChart3
} from 'lucide-react'

export function AutomationRulesManager() {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [executions, setExecutions] = useState<AutomationExecution[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [selectedTab, setSelectedTab] = useState<'rules' | 'history' | 'templates' | 'analytics'>('rules')

  const automation = getAutomationEngine()

  useEffect(() => {
    loadData()
    
    // Listen for automation executions
    const unsubscribe = automation.onExecution((execution) => {
      setExecutions(prev => [execution, ...prev.slice(0, 99)]) // Keep last 100
    })

    return unsubscribe
  }, [automation])

  const loadData = () => {
    setRules(automation.getRules())
    setExecutions(automation.getExecutionHistory())
  }

  const handleCreateRule = (ruleData: Partial<AutomationRule>) => {
    automation.createRule({
      name: ruleData.name || 'New Rule',
      description: ruleData.description || '',
      enabled: true,
      triggers: ruleData.triggers || [],
      actions: ruleData.actions || []
    })
    loadData()
    setShowCreateForm(false)
  }

  const handleUpdateRule = (rule: AutomationRule) => {
    automation.updateRule(rule.id, rule)
    loadData()
    setEditingRule(null)
  }

  const handleDeleteRule = (ruleId: string) => {
    if (confirm('Are you sure you want to delete this automation rule?')) {
      automation.deleteRule(ruleId)
      loadData()
    }
  }

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    automation.updateRule(ruleId, { enabled })
    loadData()
  }

  const createFromTemplate = (template: Partial<AutomationRule>) => {
    automation.createRule({
      name: template.name || 'New Rule',
      description: template.description || '',
      enabled: true,
      triggers: template.triggers || [],
      actions: template.actions || []
    })
    loadData()
  }

  const getTriggerIcon = (type: TriggerType) => {
    switch (type) {
      case 'task_created': return <Plus className="h-4 w-4" />
      case 'task_completed': return <CheckCircle2 className="h-4 w-4" />
      case 'task_overdue': return <AlertTriangle className="h-4 w-4" />
      case 'scheduled_time': return <Clock className="h-4 w-4" />
      default: return <Target className="h-4 w-4" />
    }
  }

  const getActionIcon = (type: ActionType) => {
    switch (type) {
      case 'send_notification': return <Bell className="h-4 w-4" />
      case 'add_tag': return <Tag className="h-4 w-4" />
      case 'set_priority': return <ArrowRight className="h-4 w-4" />
      default: return <Settings className="h-4 w-4" />
    }
  }

  const formatTriggerType = (type: TriggerType): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatActionType = (type: ActionType): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const stats = automation.getRuleStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <span>Automation Rules</span>
              <Badge variant="secondary" className="text-xs">
                {rules.filter(r => r.enabled).length} active
              </Badge>
            </div>
            <Button onClick={() => setShowCreateForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Rule
            </Button>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        {[
          { id: 'rules' as const, label: 'Rules', icon: Zap },
          { id: 'history' as const, label: 'History', icon: History },
          { id: 'templates' as const, label: 'Templates', icon: Settings },
          { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id)}
            className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {selectedTab === 'rules' && (
        <div className="space-y-4">
          {rules.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg mb-2">No Automation Rules</h3>
                <p className="text-muted-foreground text-sm max-w-md mb-4">
                  Create automation rules to automatically perform actions when certain conditions are met.
                </p>
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Rule
                </Button>
              </CardContent>
            </Card>
          ) : (
            rules.map((rule) => (
              <Card key={rule.id} className={rule.enabled ? '' : 'opacity-60'}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-medium">{rule.name}</h3>
                        <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                        {rule.execution_count > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Executed {rule.execution_count}x
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-3">
                        {rule.description}
                      </p>
                      
                      {/* Triggers */}
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">WHEN</div>
                        <div className="flex flex-wrap gap-2">
                          {rule.triggers.map((trigger, index) => (
                            <div key={index} className="flex items-center space-x-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/20 rounded text-xs">
                              {getTriggerIcon(trigger.type)}
                              <span>{formatTriggerType(trigger.type)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="space-y-2 mt-3">
                        <div className="text-xs font-medium text-muted-foreground">THEN</div>
                        <div className="flex flex-wrap gap-2">
                          {rule.actions.map((action, index) => (
                            <div key={index} className="flex items-center space-x-1 px-2 py-1 bg-green-50 dark:bg-green-950/20 rounded text-xs">
                              {getActionIcon(action.type)}
                              <span>{formatActionType(action.type)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {rule.last_executed && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Last executed: {new Date(rule.last_executed).toLocaleString()}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                        className="h-8 w-8 p-0"
                      >
                        {rule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingRule(rule)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* History Tab */}
      {selectedTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="h-5 w-5" />
                <span>Execution History</span>
                <Badge variant="secondary" className="text-xs">
                  {executions.length} executions
                </Badge>
              </div>
              {executions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    automation.clearExecutionHistory()
                    setExecutions([])
                  }}
                >
                  Clear History
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {executions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No automation executions yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {executions.map((execution) => (
                  <div key={execution.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-sm">{execution.rule_name}</span>
                          <Badge variant={execution.success ? 'default' : 'destructive'} className="text-xs">
                            {execution.success ? 'Success' : 'Failed'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {new Date(execution.executed_at).toLocaleString()}
                        </div>
                        <div className="text-sm">
                          Actions: {execution.actions_performed.join(', ')}
                        </div>
                        {execution.error && (
                          <div className="text-xs text-destructive mt-1">
                            Error: {execution.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Templates Tab */}
      {selectedTab === 'templates' && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            Get started quickly with these pre-built automation templates:
          </div>
          
          {automation.getBuiltInRules().map((template, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium mb-1">{template.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {template.description}
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-medium mb-1">Triggers:</div>
                        {template.triggers?.map((trigger, i) => (
                          <div key={i} className="flex items-center space-x-1 mb-1">
                            {getTriggerIcon(trigger.type)}
                            <span>{trigger.description}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium mb-1">Actions:</div>
                        {template.actions?.map((action, i) => (
                          <div key={i} className="flex items-center space-x-1 mb-1">
                            {getActionIcon(action.type)}
                            <span>{action.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => createFromTemplate(template)}
                    size="sm"
                  >
                    Use Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Analytics Tab */}
      {selectedTab === 'analytics' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rule Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No rule statistics available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {stats.map((stat) => (
                    <div key={stat.rule_id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{stat.name}</h3>
                        <Badge variant="secondary">
                          {stat.success_rate.toFixed(1)}% success
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Executions:</span>
                          <span className="ml-2 font-medium">{stat.execution_count}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last run:</span>
                          <span className="ml-2">
                            {stat.last_executed 
                              ? new Date(stat.last_executed).toLocaleDateString()
                              : 'Never'
                            }
                          </span>
                        </div>
                      </div>
                      
                      {/* Success rate bar */}
                      <div className="mt-2">
                        <div className="bg-muted rounded-full h-2">
                          <div 
                            className="bg-green-500 rounded-full h-2 transition-all"
                            style={{ width: `${stat.success_rate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Simple Rule Creation Form */}
      {showCreateForm && (
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-base">Create New Automation Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleRuleForm
              onSubmit={handleCreateRule}
              onCancel={() => setShowCreateForm(false)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Simple form component for creating basic rules
function SimpleRuleForm({ 
  onSubmit, 
  onCancel 
}: { 
  onSubmit: (rule: Partial<AutomationRule>) => void
  onCancel: () => void 
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('task_created')
  const [actionType, setActionType] = useState<ActionType>('send_notification')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const trigger: AutomationTrigger = {
      id: crypto.randomUUID(),
      type: triggerType,
      description: `When ${triggerType.replace(/_/g, ' ')}`
    }

    const action: AutomationAction = {
      id: crypto.randomUUID(),
      type: actionType,
      parameters: actionType === 'send_notification' 
        ? { title: 'Automation Alert', body: 'Rule triggered' }
        : actionType === 'add_tag'
        ? { tag: 'automated' }
        : { priority: 8 },
      description: `${actionType.replace(/_/g, ' ')}`
    }

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      triggers: [trigger],
      actions: [action]
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="rule-name">Rule Name</Label>
          <Input
            id="rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My automation rule"
            required
          />
        </div>
        <div>
          <Label htmlFor="rule-description">Description</Label>
          <Input
            id="rule-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this rule do?"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="trigger-type">When (Trigger)</Label>
          <select
            id="trigger-type"
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            className="w-full px-3 py-2 text-sm border rounded-md bg-background"
          >
            <option value="task_created">Task is created</option>
            <option value="task_completed">Task is completed</option>
            <option value="task_overdue">Task becomes overdue</option>
            <option value="priority_changed">Priority changes</option>
            <option value="status_changed">Status changes</option>
          </select>
        </div>
        
        <div>
          <Label htmlFor="action-type">Then (Action)</Label>
          <select
            id="action-type"
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            className="w-full px-3 py-2 text-sm border rounded-md bg-background"
          >
            <option value="send_notification">Send notification</option>
            <option value="add_tag">Add tag</option>
            <option value="set_priority">Set priority</option>
            <option value="set_status">Change status</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          Create Rule
        </Button>
      </div>
    </form>
  )
}