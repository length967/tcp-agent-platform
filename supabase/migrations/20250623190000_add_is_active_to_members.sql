-- Add is_active field to company_members table
ALTER TABLE company_members 
ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;

-- Add index for performance
CREATE INDEX idx_company_members_active ON company_members(company_id, user_id) WHERE is_active = true;

-- Update the custom JWT hook to use the new field (already done in previous migration)