import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
export type Role = 'admin' | 'supervisor' | 'ventas' | 'invitado';
class RoleService {
  private roles = new Map<string, Role>();
  constructor(){
    for (const id of [...config.adminUserIds, ...config.ownerUserIds]) this.roles.set(id, 'admin');
    const file = path.join('data', 'roles.json');
    if (fs.existsSync(file)) {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Role>;
      Object.entries(json).forEach(([k,v]) => this.roles.set(k, v));
    }
  }
  getRole(userId: string): Role { return this.roles.get(userId) || 'invitado'; }
}
export const roleService = new RoleService();
