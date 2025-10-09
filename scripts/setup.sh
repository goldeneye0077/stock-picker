#!/bin/bash

echo "🚀 Setting up Stock Picker Application..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if Python is installed
if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed. Please install Python first."
    exit 1
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm run install:all

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
npm run install:python

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data

# Copy environment files
echo "⚙️  Setting up environment files..."
cp backend/.env.example backend/.env
cp data-service/.env.example data-service/.env

echo "✅ Setup completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Configure your Tushare token in backend/.env and data-service/.env"
echo "2. Run 'npm run dev' to start all services"
echo "3. Visit http://localhost:3001 for frontend"
echo "4. API available at http://localhost:3000"
echo "5. Data service at http://localhost:8001"