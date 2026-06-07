import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function test() {
  console.log('Attempting signup...');
  const { data, error } = await supabase.auth.signUp({
    email: 'test_node_' + Date.now() + '@example.com',
    password: 'password123',
    options: {
      data: {
        full_name: 'Test Node'
      }
    }
  });
  
  if (error) {
    console.error('Signup Error:', error);
  } else {
    console.log('Signup Data:', data);
  }
}

test();
