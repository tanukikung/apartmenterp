import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get room count by floor
  const roomsByFloor = await prisma.room.groupBy({
    by: ['floorNo'],
    _count: true,
    orderBy: { floorNo: 'asc' }
  });

  console.log('\n📊 Rooms by Floor:');
  console.log('─'.repeat(50));
  let totalRooms = 0;
  roomsByFloor.forEach(floor => {
    console.log(`Floor ${floor.floorNo}: ${floor._count} rooms`);
    totalRooms += floor._count;
  });
  console.log('─'.repeat(50));
  console.log(`Total: ${totalRooms} rooms\n`);

  // Check room numbering pattern
  console.log('📝 Sample room numbers:');
  console.log('─'.repeat(50));

  for (let floor = 2; floor <= 9; floor++) {
    const rooms = await prisma.room.findMany({
      where: { floorNo: floor },
      take: 5,
      orderBy: { roomNo: 'asc' }
    });

    if (rooms.length > 0) {
      const roomNumbers = rooms.map(r => r.roomNo).join(', ');
      console.log(`Floor ${floor}: ${roomNumbers}`);
    }
  }
  console.log('─'.repeat(50));

  // Check if numbering is consistent (floor + room number)
  console.log('\n✅ Room Numbering Pattern Check:');
  const allRooms = await prisma.room.findMany({ take: 10 });
  const patternCorrect = allRooms.every(room => {
    const floorPrefix = room.roomNo.substring(0, 1);
    return parseInt(floorPrefix) === room.floorNo;
  });

  if (patternCorrect) {
    console.log('✓ All room numbers follow pattern: [Floor][Number]');
  } else {
    console.log('✗ Some room numbers do NOT match their floor');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
