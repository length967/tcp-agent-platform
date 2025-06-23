#!/bin/bash

# Apply migration to remote Supabase project
# This script reads the .env file and applies migrations

set -e

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if SUPABASE_DB_URL is set
if [ -z "$SUPABASE_DB_URL" ]; then
  echo "Error: SUPABASE_DB_URL not found in .env file"
  echo "Please add: SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
  exit 1
fi

echo "Applying migrations to Supabase..."
npx supabase db push --db-url "$SUPABASE_DB_URL"

echo "Migration complete!"