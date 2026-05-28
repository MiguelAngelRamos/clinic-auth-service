// src/users/users.service.ts
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as argon2 from "argon2";
import { User, UserRole } from "./entities/user.entity";

export interface CreateUserDto {
  email: string;
  password: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    // Verificar email único antes de hashear — evita trabajo innecesario
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      // Mensaje genérico — no revelar si el email existe
      // OWASP A01: Broken Access Control — user enumeration
      throw new ConflictException("El email ya está registrado");
    }

    // Argon2id — el algoritmo más resistente a ataques de fuerza bruta
    // memoryCost: 64MB | timeCost: 3 iteraciones | parallelism: 4 hilos
    // OWASP A02:2025 Cryptographic Failures
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      role: dto.role,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`Usuario creado: ${saved.email} [${saved.role}]`);
    return saved;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    return user;
  }

  async updateRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.userRepository.update(id, { refreshTokenHash: hash });
  }
}
