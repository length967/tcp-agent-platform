#!/bin/bash

# Master Setup Script for TCP Agent AI Platform
# Orchestrates the complete setup process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 TCP Agent AI Platform - Complete Setup${NC}"
echo "=============================================="
echo ""

# Check if we're in the right directory
if [ ! -f "README.md" ] || [ ! -d "models" ]; then
    echo -e "${RED}❌ Please run this script from the ai/ directory${NC}"
    exit 1
fi

# Check and create virtual environment
if [ ! -d "venv" ]; then
    echo -e "${BLUE}🐍 Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${BLUE}🔧 Activating virtual environment...${NC}"
source venv/bin/activate

# Function to run a command and check its result
run_step() {
    local step_name="$1"
    local command="$2"
    local optional="$3"
    
    echo -e "${BLUE}📋 $step_name${NC}"
    echo "Command: $command"
    
    if eval "$command"; then
        echo -e "${GREEN}✅ $step_name completed successfully${NC}"
        echo ""
        return 0
    else
        if [ "$optional" = "optional" ]; then
            echo -e "${YELLOW}⚠️ $step_name failed (optional step)${NC}"
            echo ""
            return 0
        else
            echo -e "${RED}❌ $step_name failed${NC}"
            echo ""
            return 1
        fi
    fi
}

# Main setup process
main() {
    echo "Starting complete AI platform setup..."
    echo ""
    
    # Step 1: Environment Setup
    if ! run_step "Environment Setup" "python3 scripts/setup_environment.py --skip-clickhouse"; then
        echo -e "${RED}❌ Environment setup failed. Please check Python installation and dependencies.${NC}"
        exit 1
    fi
    
    # Step 2: ClickHouse Setup
    if ! run_step "ClickHouse Setup" "./scripts/setup_clickhouse.sh"; then
        echo -e "${RED}❌ ClickHouse setup failed. Please check Docker installation.${NC}"
        exit 1
    fi
    
    # Step 3: Verify Environment
    if ! run_step "Environment Verification" "python3 scripts/setup_environment.py --skip-clickhouse"; then
        echo -e "${YELLOW}⚠️ Environment verification had issues, but continuing...${NC}"
    fi
    
    # Step 4: Test Training Pipeline
    run_step "Training Pipeline Test" "python3 train_with_clickhouse.py" "optional"
    
    # Final status
    echo -e "${GREEN}🎉 AI Platform Setup Complete!${NC}"
    echo ""
    echo -e "${BLUE}📊 System Status:${NC}"
    
    # Check ClickHouse status
    if curl -s "http://localhost:8123/" > /dev/null 2>&1; then
        echo -e "  ClickHouse: ${GREEN}✅ Running${NC}"
    else
        echo -e "  ClickHouse: ${RED}❌ Not accessible${NC}"
    fi
    
    # Check Python dependencies
    if python3 -c "import torch, tensorflow, xgboost, sklearn, pandas, numpy, clickhouse_connect" 2>/dev/null; then
        echo -e "  Dependencies: ${GREEN}✅ Installed${NC}"
    else
        echo -e "  Dependencies: ${YELLOW}⚠️ Some missing${NC}"
    fi
    
    # Check directory structure
    if [ -d "models" ] && [ -d "docs" ] && [ -d "scripts" ] && [ -d "docker" ]; then
        echo -e "  Directory Structure: ${GREEN}✅ Complete${NC}"
    else
        echo -e "  Directory Structure: ${YELLOW}⚠️ Incomplete${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}📚 Next Steps:${NC}"
    echo "  1. Review configuration: cat config.json"
    echo "  2. Check ClickHouse UI: http://localhost:8123/play"
    echo "  3. Run training: python train_with_clickhouse.py"
    echo "  4. View documentation: cat README.md"
    echo ""
    echo -e "${BLUE}🛠️ Useful Commands:${NC}"
    echo "  Start ClickHouse:    ./scripts/setup_clickhouse.sh"
    echo "  Stop ClickHouse:     ./scripts/setup_clickhouse.sh stop"
    echo "  Test Environment:    python3 scripts/setup_environment.py"
    echo "  View Logs:           docker-compose -f docker/docker-compose.clickhouse.yml logs -f"
    echo ""
    echo -e "${YELLOW}📋 For troubleshooting, see:${NC}"
    echo "  - README.md (this directory)"
    echo "  - docs/CLICKHOUSE_SETUP.md"
    echo "  - docs/AI_IMPLEMENTATION_STATUS.md"
}

# Handle command line arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "quick")
        echo -e "${BLUE}🚀 Quick Setup (minimal)${NC}"
        echo "========================"
        run_step "Environment Setup" "python3 scripts/setup_environment.py --skip-clickhouse"
        run_step "ClickHouse Setup" "./scripts/setup_clickhouse.sh"
        echo -e "${GREEN}✅ Quick setup complete${NC}"
        ;;
    "clean")
        echo -e "${BLUE}🧹 Cleaning up AI Platform${NC}"
        echo "=========================="
        ./scripts/setup_clickhouse.sh clean
        rm -f config.json
        rm -rf logs/ data/ models/trained/
        echo -e "${GREEN}✅ Cleanup complete${NC}"
        ;;
    "status")
        echo -e "${BLUE}📊 AI Platform Status${NC}"
        echo "===================="
        
        # ClickHouse status
        if curl -s "http://localhost:8123/" > /dev/null 2>&1; then
            echo -e "ClickHouse: ${GREEN}✅ Running${NC}"
            ./scripts/setup_clickhouse.sh test
        else
            echo -e "ClickHouse: ${RED}❌ Not running${NC}"
        fi
        
        # Python environment
        python3 scripts/setup_environment.py --skip-clickhouse
        ;;
    "help")
        echo "TCP Agent AI Platform Setup"
        echo ""
        echo "Usage: $0 {setup|quick|clean|status|help}"
        echo ""
        echo "Commands:"
        echo "  setup   - Complete setup (default)"
        echo "  quick   - Quick setup without full validation"
        echo "  clean   - Clean up all generated files and stop services"
        echo "  status  - Check status of all components"
        echo "  help    - Show this help message"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac 