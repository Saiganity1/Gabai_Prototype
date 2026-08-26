import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth() {
    return {
      status: 'ok',
      service: 'gabai-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
