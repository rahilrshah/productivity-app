# AI-Powered Personal Productivity System

A free, self-hosted, AI-powered productivity system that rivals commercial solutions like Notion while maintaining zero operational costs. Built with privacy-first architecture, local AI integration, and seamless cross-platform sync.

## 🌟 Key Features

### Zero Cost & Privacy-First
- **No subscription fees** - Self-hosted with zero operational costs
- **Client-side encryption** - All data encrypted with AES-256-GCM before leaving your device
- **Local LLM integration** - AI processing without sending data to external services
- **Zero-knowledge architecture** - We can't read your data even if we wanted to

### Core Functionality
- **Rich Task Management** - Create, organize, and track tasks with rich text content
- **AI-Powered Assistance** - Local LLM for task parsing, prioritization, and suggestions
- **Smart Scheduling** - Automated scheduling with calendar integration
- **Real-time Sync** - CRDT-based conflict resolution across all devices
- **Offline-First** - Full functionality without internet connection

### Cross-Platform
- **Progressive Web App** - Native-like experience on all platforms
- **Responsive Design** - Optimized for desktop, tablet, and mobile
- **Dark/Light Mode** - Automatic theme switching with system sync

## 🚀 Tech Stack

### Frontend
- **Next.js 14** - React framework with app router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality component library
- **Tiptap 2.0** - Rich text editor
- **Zustand** - State management

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Supabase** - PostgreSQL database with real-time features
- **Vercel Edge Functions** - Global edge deployment

### AI/ML
- **Ollama** - Local LLM runtime
- **Mistral-7B** - Recommended local model
- **Claude API** - Optional advanced AI features

### Security & Sync
- **AES-256-GCM** - Client-side encryption
- **PBKDF2** - Key derivation with high iteration count
- **CRDT** - Conflict-free replicated data types for sync
- **IndexedDB** - Local storage with encryption

## 📦 Quick Start

### Prerequisites
- Node.js 20 or higher
- PostgreSQL database (Supabase recommended)
- (Optional) Ollama for local AI features

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/productivity-app.git
   cd productivity-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your Supabase credentials and other configuration:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. **Set up the database**
   
   Apply the database migrations in Supabase:
   ```sql
   -- Copy and run the SQL from supabase/migrations/20240101000000_initial_schema.sql
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

### Optional: Local AI Setup

1. **Install Ollama**
   ```bash
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

2. **Download Mistral-7B model**
   ```bash
   ollama pull mistral:7b-instruct
   ```

3. **Update environment**
   ```env
   OLLAMA_BASE_URL=http://localhost:11434
   ```

## 🔧 Development

### Project Structure

```
src/
├── app/                    # Next.js app router
├── components/            # React components
│   ├── core/             # Task management components
│   ├── shared/           # Shared UI components
│   └── ui/               # Base UI components
├── hooks/                # Custom React hooks
├── lib/                  # Utility libraries
│   ├── auth/            # Authentication service
│   ├── encryption/      # Client-side encryption
│   ├── storage/         # IndexedDB integration
│   ├── supabase/        # Database client
│   └── sync/            # Sync service
└── types/               # TypeScript type definitions
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

### Development Guidelines

- **Code Style**: Follow TypeScript and React best practices
- **Components**: Use functional components with hooks
- **Styling**: Use Tailwind CSS utility classes
- **State**: Use Zustand for global state, React hooks for local state
- **Testing**: Write tests for critical functionality
- **Security**: Never log sensitive data, always encrypt before storage

## 🔐 Security & Privacy

### Client-Side Encryption
All sensitive data is encrypted client-side before being stored or transmitted:
- **Master Key**: Derived from user password using PBKDF2 (175,000 iterations)
- **Purpose-Specific Keys**: Separate keys for tasks, settings, AI context
- **Device Keys**: Local encryption for offline storage
- **Key Rotation**: Automatic key rotation for enhanced security

### Zero-Knowledge Architecture
- Passwords never leave your device
- Encrypted data is meaningless without your key
- Even database administrators can't read your tasks
- AI processing happens locally when possible

## 📱 PWA Features

The app works as a Progressive Web App with:
- **Offline Functionality**: Full task management without internet
- **App-like Experience**: Install on any device like a native app
- **Background Sync**: Changes sync automatically when online
- **Push Notifications**: Task reminders and deadline alerts
- **Cross-Platform**: Same experience on desktop and mobile

## 🤖 AI Features

### Local LLM Integration
- **Task Parsing**: Extract due dates, priorities, and tags from natural language
- **Smart Suggestions**: AI-powered task recommendations
- **Priority Scoring**: Intelligent task prioritization
- **Schedule Optimization**: Optimal time blocking suggestions

### Claude Integration (Optional)
- **Advanced Commands**: Complex task manipulation via natural language
- **Data Export**: Export tasks in various formats
- **Analytics**: Insights into productivity patterns

## 🌐 Deployment

### Vercel (Recommended)

1. **Connect to Vercel**
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Set environment variables** in Vercel dashboard

3. **Deploy**
   ```bash
   vercel --prod
   ```

### Self-Hosting

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the server**
   ```bash
   npm run start
   ```

3. **Configure reverse proxy** (nginx/Apache) for HTTPS

## 📊 Performance Targets

- **Page Load Time**: <2s on 3G
- **Time to Interactive**: <3s
- **API Response**: <100ms p95
- **Local LLM**: <500ms response
- **Sync Latency**: <1s
- **Memory Usage**: <200MB
- **Bundle Size**: <200KB

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Next.js** team for the excellent framework
- **Supabase** for the backend infrastructure
- **shadcn** for the beautiful UI components
- **Ollama** team for making local AI accessible
- **Open source community** for inspiration and tools

## 📧 Support

- **Documentation**: [Full documentation](https://docs.example.com)
- **Issues**: [GitHub Issues](https://github.com/yourusername/productivity-app/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/productivity-app/discussions)

---

Built with ❤️ for privacy-conscious productivity enthusiasts.