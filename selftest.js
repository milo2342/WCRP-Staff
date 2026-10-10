const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync('index.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.equal(pkg.name, 'WCRP-staff-utilities');
assert.equal(pkg.version, '1.2.0');
assert(src.includes("setName('onboard')"), '/staff onboard missing');
assert(!src.includes("sc.setName('add').setDescription('Add a user to the staff team"), 'legacy /staff add still registered');
assert(src.includes("setName('promote')"), '/promote missing');
assert(src.includes("setName('demote')"), '/demote missing');
assert(src.includes("Choose a rank above"), 'promotion direction guard missing');
assert(src.includes("Choose a rank below"), 'demotion direction guard missing');
assert(src.includes("sendPermanentStaffLog"), 'permanent Staff Discord logging missing');
assert(src.includes("Create the permanent staff record BEFORE role assignment"), 'onboarding log ordering guard missing');
assert(src.includes("setTitle('✅ Onboarded Staff Member Joined')"), 'post-join onboarding log missing');
assert(src.includes("setName('data')"), '/data command missing');
assert(src.includes("setName('backup')"), '/data backup missing');
assert(src.includes("AUTO_BACKUP_MS = 6 * 60 * 60 * 1000"), 'automatic backup cadence missing');
assert(src.includes("BACKUP_KEEP = 10"), 'backup retention missing');
assert(src.includes("process.env.DATA_DIR"), 'DATA_DIR support missing');
assert(src.includes("store.onboarding"), 'onboarding persistence missing');
assert(src.includes("store.staffHub"), 'staff hub persistence missing');

console.log('WCRP Staff Utilities v1.2.0 static tests passed.');
