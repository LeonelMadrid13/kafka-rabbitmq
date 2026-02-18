import { Module } from '@nestjs/common';
import { RecoveryService } from './recovery.service';

@Module({
  providers: [RecoveryService]
})
export class RecoveryModule {}
