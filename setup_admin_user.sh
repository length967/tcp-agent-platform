#!/bin/bash

# Setup Admin User Script
# Run this after each database reset to create mark.johns@me.com with full admin permissions

echo "Setting up admin user for local Supabase..."

# Execute the SQL script using psql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f create_admin_user.sql

echo "Admin user setup complete!"
echo ""
echo "You can now login with:"
echo "Email: mark.johns@me.com"
echo "Password: Dal3tplus1"
echo "Company: Mediamasters (Enterprise subscription)"
echo ""
echo "To test the team API:"
echo "curl -H 'Authorization: Bearer [JWT_TOKEN]' http://127.0.0.1:54321/functions/v1/api-gateway/team"
echo ""
echo "📖 Full documentation available at: docs/SETUP_DOCUMENTATION.md" 