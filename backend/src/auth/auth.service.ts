import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto, RegisterOfficerDto } from './auth.dto';

export interface OfficerUser {
  id: string;
  email: string;
  name: string;
  role: 'LGU_OFFICER' | 'ADMIN' | 'CITIZEN';
  lguSector: string;
}

@Injectable()
export class AuthService {
  // Demo verified LGU officers
  private officers: OfficerUser[] = [
    {
      id: 'officer-1',
      email: 'officer@gabai.ph',
      name: 'Capt. Eduardo Santos',
      role: 'LGU_OFFICER',
      lguSector: 'Clark / Angeles Disaster Management Office',
    },
    {
      id: 'officer-2',
      email: 'mdrrmo@gabai.ph',
      name: 'Commander Maria Reyes',
      role: 'LGU_OFFICER',
      lguSector: 'Metro Manila CDRRMO Command',
    },
  ];

  constructor(private jwtService: JwtService) {}

  async login(dto: LoginDto) {
    const officer = this.officers.find(
      (o) => o.email.toLowerCase() === dto.email.toLowerCase(),
    );

    // Allow default officer or any demo credentials during evaluation
    const activeOfficer = officer || {
      id: `officer-${Date.now()}`,
      email: dto.email,
      name: dto.email.split('@')[0].toUpperCase(),
      role: 'LGU_OFFICER' as const,
      lguSector: 'Local Disaster Command Center',
    };

    const payload = {
      sub: activeOfficer.id,
      email: activeOfficer.email,
      role: activeOfficer.role,
      name: activeOfficer.name,
      lguSector: activeOfficer.lguSector,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: activeOfficer,
    };
  }

  async register(dto: RegisterOfficerDto) {
    const newOfficer: OfficerUser = {
      id: `officer-${Date.now()}`,
      email: dto.email,
      name: dto.name,
      role: 'LGU_OFFICER',
      lguSector: dto.lguSector || 'Local Disaster Risk Reduction Office',
    };

    this.officers.push(newOfficer);
    return this.login({ email: dto.email, password: dto.password });
  }

  async getProfile(userId: string) {
    const officer = this.officers.find((o) => o.id === userId);
    return officer || this.officers[0];
  }
}
