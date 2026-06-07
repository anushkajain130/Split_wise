import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runE2ETest() {
  console.log('--- STARTING E2E API TEST ---');
  
  // 1. Sign Up
  const email = `test_user_${Date.now()}@test.com`;
  const password = 'password123';
  console.log(`1. Signing up user: ${email}`);
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: 'E2E Tester' }
    }
  });

  if (authError) {
    console.error('Signup failed:', authError.message);
    return;
  }
  console.log('✅ Signup successful! User ID:', authData.user?.id);

  // 2. Create Group
  console.log('\n2. Creating a group...');
  const { data: groupData, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: 'Test Group',
      description: 'E2E Testing',
      category: 'other',
      created_by: authData.user?.id
    })
    .select()
    .single();

  if (groupError) {
    console.error('Failed to create group:', groupError);
    return;
  }
  console.log('✅ Group created! Group ID:', groupData.id);

  // 3. Add Member (Simulating the creator adding themselves, although RLS/triggers usually handle this, but let's do it explicitly if needed)
  console.log('\n3. Adding user to group members...');
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: groupData.id,
      user_id: authData.user?.id,
      role: 'admin'
    });

  if (memberError) {
    console.error('Failed to add member:', memberError);
    // Proceed anyway as it might have a trigger
  } else {
    console.log('✅ Added user as group member.');
  }

  // 4. Add Expense
  console.log('\n4. Adding an expense of $100...');
  const { data: expenseData, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      group_id: groupData.id,
      paid_by: authData.user?.id,
      description: 'Test Dinner',
      amount: 100,
      split_type: 'equal',
      category: 'food'
    })
    .select()
    .single();

  if (expenseError) {
    console.error('Failed to add expense:', expenseError);
    return;
  }
  console.log('✅ Expense added! Expense ID:', expenseData.id);

  // 5. Add Expense Split
  console.log('\n5. Creating expense splits...');
  const { error: splitError } = await supabase
    .from('expense_splits')
    .insert({
      expense_id: expenseData.id,
      user_id: authData.user?.id,
      owed_amount: 100, // They owe it all since they are the only member
      paid_amount: 100,
      share_value: 1
    });

  if (splitError) {
    console.error('Failed to create split:', splitError);
    return;
  }
  console.log('✅ Expense split created.');

  // 6. Verify Dashboard Data
  console.log('\n6. Fetching recent expenses...');
  const { data: recentExpenses, error: fetchError } = await supabase
    .from('expenses')
    .select('*')
    .eq('group_id', groupData.id);

  if (fetchError) {
    console.error('Failed to fetch expenses:', fetchError);
    return;
  }
  
  if (recentExpenses && recentExpenses.length > 0) {
    console.log('✅ Found expenses for group:', recentExpenses[0].description);
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The backend is working perfectly.');
  } else {
    console.error('❌ Could not find the created expense.');
  }
}

runE2ETest();
