import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
    console.log('Starting migration...');
    try {
        // 1. Add new values to the Postgres ENUM type if they don't exist
        // Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction in some Postgres versions.
        const newValues = ['General', 'Otp', 'Ip_address', 'Ip_Otp'];
        for (const val of newValues) {
            try {
                await prisma.$executeRawUnsafe(`ALTER TYPE "LoginMethod" ADD VALUE IF NOT EXISTS '${val}'`);
                console.log(`Added enum value: ${val}`);
            } catch (e) {
                // Ignore if value already exists (Postgres versions < 13 don't support IF NOT EXISTS for ADD VALUE)
                console.log(`Note: Enum value ${val} might already exist or error occurred: ${e.message}`);
            }
        }

        // 2. Update all teams with old loginMethod values to 'General'
        const updated = await prisma.$executeRaw`
      UPDATE teams 
      SET "loginMethod" = 'General' 
      WHERE "loginMethod" IN ('EMAIL', 'PHONE', 'BOTH')
    `;
        console.log(`Migration successful. Updated ${updated} records.`);
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
