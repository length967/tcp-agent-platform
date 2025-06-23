-- Fix the auth trigger to properly reference the public schema
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_company_id UUID;
    new_project_id UUID;
    company_name TEXT;
    company_slug TEXT;
BEGIN
    -- Create user profile in public schema
    INSERT INTO public.user_profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    
    -- Create company if provided in metadata
    IF NEW.raw_user_meta_data->>'company_name' IS NOT NULL THEN
        company_name := NEW.raw_user_meta_data->>'company_name';
        company_slug := LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'));
        
        -- Ensure unique slug
        WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = company_slug) LOOP
            company_slug := company_slug || '-' || substring(md5(random()::text) from 1 for 4);
        END LOOP;
        
        -- Create company
        INSERT INTO public.companies (name, slug)
        VALUES (company_name, company_slug)
        RETURNING id INTO new_company_id;
        
        -- Add user as owner of the company
        INSERT INTO public.company_members (company_id, user_id, role)
        VALUES (new_company_id, NEW.id, 'owner');
        
        -- Update user profile with company_id
        UPDATE public.user_profiles 
        SET company_id = new_company_id 
        WHERE id = NEW.id;
        
        -- Create default project
        INSERT INTO public.projects (company_id, name, slug)
        VALUES (new_company_id, 'Default Project', 'default')
        RETURNING id INTO new_project_id;
        
        -- Add user to default project
        INSERT INTO public.project_members (project_id, user_id, role)
        VALUES (new_project_id, NEW.id, 'owner');
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't prevent user creation
        RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger to ensure it's properly attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();