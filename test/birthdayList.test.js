const { test } = require('node:test');
const assert = require('node:assert');

// Test that the birthday list merging logic works correctly
test('birthday list merging and sorting', async () => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthOrder = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
    
    // Simulate existing birthdays
    const existingBirthdays = [
        { firstName: 'Andreas', lastName: 'Olig', dateOfBirth: new Date(1972, 3, 21), month: 'Apr' },
        { firstName: 'Annette', lastName: 'Yip', dateOfBirth: new Date(1989, 3, 19), month: 'Apr' },
        { firstName: 'Aino', lastName: 'Sueda', dateOfBirth: new Date(2025, 7, 14), month: 'Aug' }
    ];
    
    // Simulate new birthdays from starters
    const newBirthdays = [
        { firstName: 'John', lastName: 'Doe', dateOfBirth: new Date(1990, 3, 15), month: 'Apr' },
        { firstName: 'Jane', lastName: 'Smith', dateOfBirth: new Date(1995, 7, 20), month: 'Aug' }
    ];
    
    // Merge and avoid duplicates
    const allBirthdays = [...existingBirthdays];
    for (const newBday of newBirthdays) {
        const isDuplicate = existingBirthdays.some(existing => 
            existing.firstName === newBday.firstName && 
            existing.lastName === newBday.lastName
        );
        if (!isDuplicate) {
            allBirthdays.push(newBday);
        }
    }
    
    // Sort by month, then by day
    allBirthdays.sort((a, b) => {
        const monthDiff = monthOrder[a.month] - monthOrder[b.month];
        if (monthDiff !== 0) return monthDiff;
        
        const dateA = a.dateOfBirth instanceof Date ? a.dateOfBirth : new Date(a.dateOfBirth);
        const dateB = b.dateOfBirth instanceof Date ? b.dateOfBirth : new Date(b.dateOfBirth);
        return dateA.getDate() - dateB.getDate();
    });
    
    // Verify merging worked
    assert.strictEqual(allBirthdays.length, 5, 'Should have 5 total birthdays');
    
    // Verify sorting worked (April should come first, sorted by day)
    assert.strictEqual(allBirthdays[0].firstName, 'John', 'First should be John (Apr 15)');
    assert.strictEqual(allBirthdays[1].firstName, 'Annette', 'Second should be Annette (Apr 19)');
    assert.strictEqual(allBirthdays[2].firstName, 'Andreas', 'Third should be Andreas (Apr 21)');
    assert.strictEqual(allBirthdays[3].firstName, 'Aino', 'Fourth should be Aino (Aug 14)');
    assert.strictEqual(allBirthdays[4].firstName, 'Jane', 'Fifth should be Jane (Aug 20)');
});

test('birthday list prevents duplicates', async () => {
    const existingBirthdays = [
        { firstName: 'John', lastName: 'Doe', dateOfBirth: new Date(1990, 3, 15), month: 'Apr' }
    ];
    
    const newBirthdays = [
        { firstName: 'John', lastName: 'Doe', dateOfBirth: new Date(1990, 3, 15), month: 'Apr' },
        { firstName: 'Jane', lastName: 'Smith', dateOfBirth: new Date(1995, 7, 20), month: 'Aug' }
    ];
    
    const allBirthdays = [...existingBirthdays];
    for (const newBday of newBirthdays) {
        const isDuplicate = existingBirthdays.some(existing => 
            existing.firstName === newBday.firstName && 
            existing.lastName === newBday.lastName
        );
        if (!isDuplicate) {
            allBirthdays.push(newBday);
        }
    }
    
    assert.strictEqual(allBirthdays.length, 2, 'Should only have 2 entries (duplicate prevented)');
    assert.strictEqual(allBirthdays[0].firstName, 'John', 'First should be John');
    assert.strictEqual(allBirthdays[1].firstName, 'Jane', 'Second should be Jane');
});
