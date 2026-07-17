import { z } from 'zod';
import { ORG_ROLES } from '../constants.js';

export const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(slugRegex, 'Lowercase letters, digits and dashes; 2–40 chars.'),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(ORG_ROLES),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ORG_ROLES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
