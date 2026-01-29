const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkCompletedTasks() {
    try {
        console.log('===== CHECKING COMPLETED TASKS =====\n');

        // Get all completed tasks
        const completedTasks = await prisma.completedTask.findMany({
            orderBy: { completedAt: 'desc' },
            take: 10,
            select: {
                id: true,
                taskNo: true,
                taskTitle: true,
                taskStatus: true,
                createdBy: true,
                assignedTo: true,
                workingBy: true,
                targetTeamId: true,
                completedAt: true,
                completeTime: true,
            }
        });

        console.log(`Total Completed Tasks Found: ${completedTasks.length}\n`);

        if (completedTasks.length === 0) {
            console.log('❌ NO COMPLETED TASKS IN DATABASE!\n');

            // Check pending tasks
            const pendingTasks = await prisma.pendingTask.findMany({
                orderBy: { createdTime: 'desc' },
                take: 5,
                select: {
                    id: true,
                    taskNo: true,
                    taskTitle: true,
                    taskStatus: true,
                    createdBy: true,
                    assignedTo: true,
                    workingBy: true,
                }
            });

            console.log(`\nPending Tasks (showing last 5):`);
            pendingTasks.forEach((task, i) => {
                console.log(`\n${i + 1}. Task: ${task.taskNo} - ${task.taskTitle}`);
                console.log(`   Status: ${task.taskStatus}`);
                console.log(`   Creator: ${task.createdBy}`);
                console.log(`   Assigned: ${task.assignedTo}`);
                console.log(`   Worker: ${task.workingBy}`);
            });
        } else {
            console.log('✅ Completed Tasks (newest first):\n');

            completedTasks.forEach((task, i) => {
                console.log(`${i + 1}. Task: ${task.taskNo} - ${task.taskTitle}`);
                console.log(`   Status: ${task.taskStatus}`);
                console.log(`   Creator: ${task.createdBy}`);
                console.log(`   Assigned: ${task.assignedTo}`);
                console.log(`   Worker: ${task.workingBy}`);
                console.log(`   Target Team: ${task.targetTeamId}`);
                console.log(`   Completed At: ${task.completedAt}`);
                console.log(`   Complete Time: ${task.completeTime}`);
                console.log('');
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkCompletedTasks();
