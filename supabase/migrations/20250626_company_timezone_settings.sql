-- Add timezone settings to companies table
ALTER TABLE companies 
ADD COLUMN default_timezone VARCHAR(100) DEFAULT 'UTC',
ADD COLUMN enforce_timezone BOOLEAN DEFAULT false,
ADD COLUMN business_hours_start TIME DEFAULT '09:00:00',
ADD COLUMN business_hours_end TIME DEFAULT '17:00:00',
ADD COLUMN business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5]; -- Monday=1, Sunday=7

-- Add comments for clarity
COMMENT ON COLUMN companies.default_timezone IS 'Default timezone for company operations (IANA timezone)';
COMMENT ON COLUMN companies.enforce_timezone IS 'If true, users must use company timezone, cannot override';
COMMENT ON COLUMN companies.business_hours_start IS 'Start of business hours in company timezone';
COMMENT ON COLUMN companies.business_hours_end IS 'End of business hours in company timezone';
COMMENT ON COLUMN companies.business_days IS 'Array of business days (1=Monday, 7=Sunday)';

-- Create function to check if current time is within business hours
CREATE OR REPLACE FUNCTION is_business_hours(company_id UUID, check_time TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  company_tz VARCHAR(100);
  business_start TIME;
  business_end TIME;
  business_days INTEGER[];
  local_time TIMESTAMPTZ;
  current_day INTEGER;
  current_time_value TIME;
BEGIN
  -- Get company timezone and business hours
  SELECT 
    COALESCE(default_timezone, 'UTC'),
    business_hours_start,
    business_hours_end,
    business_days
  INTO 
    company_tz,
    business_start,
    business_end,
    business_days
  FROM companies
  WHERE id = company_id;
  
  -- Convert to company timezone
  local_time := check_time AT TIME ZONE company_tz;
  current_day := EXTRACT(DOW FROM local_time); -- 0=Sunday, 6=Saturday
  current_time_value := local_time::TIME;
  
  -- Convert PostgreSQL day (0=Sunday) to our format (1=Monday, 7=Sunday)
  IF current_day = 0 THEN
    current_day := 7;
  END IF;
  
  -- Check if current day is a business day
  IF NOT (current_day = ANY(business_days)) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if current time is within business hours
  RETURN current_time_value BETWEEN business_start AND business_end;
END;
$$;

-- Create function to get company timezone info
CREATE OR REPLACE FUNCTION get_company_timezone_info(company_id UUID)
RETURNS TABLE (
  timezone VARCHAR(100),
  enforce_timezone BOOLEAN,
  business_hours_start TIME,
  business_hours_end TIME,
  business_days INTEGER[],
  is_business_hours BOOLEAN,
  local_time TIMESTAMPTZ
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(c.default_timezone, 'UTC') as timezone,
    c.enforce_timezone,
    c.business_hours_start,
    c.business_hours_end,
    c.business_days,
    is_business_hours(c.id) as is_business_hours,
    (NOW() AT TIME ZONE COALESCE(c.default_timezone, 'UTC')) as local_time
  FROM companies c
  WHERE c.id = company_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_business_hours TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_timezone_info TO authenticated;

-- Update existing companies with default values
UPDATE companies 
SET 
  default_timezone = 'UTC',
  enforce_timezone = false,
  business_hours_start = '09:00:00',
  business_hours_end = '17:00:00',
  business_days = ARRAY[1,2,3,4,5]
WHERE default_timezone IS NULL; 