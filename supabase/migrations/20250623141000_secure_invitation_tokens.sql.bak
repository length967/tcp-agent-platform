-- Drop the existing unique constraint on token
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_token_key;

-- Add token_hash column
ALTER TABLE invitations 
ADD COLUMN token_hash TEXT;

-- Create function to generate secure token
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TABLE(token TEXT, token_hash TEXT) AS $$
DECLARE
  raw_token BYTEA;
  plain_token TEXT;
  hashed_token TEXT;
BEGIN
  -- Generate 32 random bytes
  raw_token := gen_random_bytes(32);
  
  -- Create URL-safe base64 token for sending to user
  plain_token := encode(raw_token, 'base64');
  plain_token := replace(plain_token, '+', '-');
  plain_token := replace(plain_token, '/', '_');
  plain_token := replace(plain_token, '=', '');
  
  -- Create SHA256 hash for storage
  hashed_token := encode(digest(raw_token, 'sha256'), 'hex');
  
  RETURN QUERY SELECT plain_token, hashed_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing tokens (in production, you'd handle this differently)
UPDATE invitations 
SET token_hash = encode(digest(token::bytea, 'sha256'), 'hex')
WHERE token_hash IS NULL;

-- Make token_hash required and unique
ALTER TABLE invitations
ALTER COLUMN token_hash SET NOT NULL,
ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);

-- Remove the default (we'll generate tokens in the application or via trigger)
ALTER TABLE invitations 
ALTER COLUMN token DROP DEFAULT;

-- Create index for token lookups
CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);

-- Create trigger to generate tokens
CREATE OR REPLACE FUNCTION generate_invitation_token_trigger()
RETURNS TRIGGER AS $$
DECLARE
  token_result RECORD;
BEGIN
  -- Generate token only if not provided
  IF NEW.token IS NULL THEN
    SELECT * INTO token_result FROM generate_invitation_token();
    NEW.token := token_result.token;
    NEW.token_hash := token_result.token_hash;
  ELSE
    -- If token is provided, generate hash
    NEW.token_hash := encode(digest(NEW.token::bytea, 'sha256'), 'hex');
  END IF;
  
  -- Security: Clear the plain text token after hashing
  -- The token will be returned in the INSERT response but not stored
  -- Note: This happens AFTER INSERT, so the client still gets the token
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_invitation_token
BEFORE INSERT ON invitations
FOR EACH ROW
EXECUTE FUNCTION generate_invitation_token_trigger();

-- Create trigger to clear token after insert (security best practice)
CREATE OR REPLACE FUNCTION clear_invitation_token()
RETURNS TRIGGER AS $$
BEGIN
  -- Clear the plain text token after it's been returned to the client
  UPDATE invitations 
  SET token = NULL 
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER clear_token_after_insert
AFTER INSERT ON invitations
FOR EACH ROW
EXECUTE FUNCTION clear_invitation_token();

-- Drop existing function first
DROP FUNCTION IF EXISTS accept_invitation(TEXT, UUID);

-- Update accept_invitation function to use hashed tokens
CREATE OR REPLACE FUNCTION accept_invitation(
  p_token TEXT,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_invitation invitations%ROWTYPE;
  v_token_hash TEXT;
  v_result JSON;
BEGIN
  -- Hash the provided token
  v_token_hash := encode(digest(p_token::bytea, 'sha256'), 'hex');
  
  -- Find invitation by hashed token
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token_hash = v_token_hash
    AND status = 'pending'
    AND expires_at > NOW()
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;
  
  -- Check if user already exists in company
  IF EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = v_invitation.company_id
      AND user_id = p_user_id
  ) THEN
    -- Update invitation status
    UPDATE invitations
    SET status = 'accepted',
        accepted_at = NOW(),
        accepted_by = p_user_id
    WHERE id = v_invitation.id;
    
    RETURN json_build_object(
      'success', false,
      'error', 'User already member of company'
    );
  END IF;
  
  -- Add user to company
  INSERT INTO company_members (company_id, user_id, role)
  VALUES (v_invitation.company_id, p_user_id, v_invitation.company_role);
  
  -- Add to project if specified
  IF v_invitation.project_id IS NOT NULL THEN
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (v_invitation.project_id, p_user_id, v_invitation.project_role);
  END IF;
  
  -- Update invitation
  UPDATE invitations
  SET status = 'accepted',
      accepted_at = NOW()
  WHERE id = v_invitation.id;
  
  -- Return success with IDs
  v_result := json_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'project_id', v_invitation.project_id
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;