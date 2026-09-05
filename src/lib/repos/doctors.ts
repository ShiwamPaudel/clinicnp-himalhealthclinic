/**
 * doctors.ts — the people whose names go on a slip and who take a share.
 *
 * A doctor is not a login. A doctor who also uses the system gets a normal
 * user account separately (PRD §4B.3).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { ShareBasis } from "@/lib/clinic-calc";

export interface Doctor {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  shareBasis: ShareBasis;
  /** Basis points for the percentage bases, paisa for fixed_consult. */
  shareValue: number;
  active: boolean;
}

export interface DoctorInput {
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  shareBasis: ShareBasis;
  shareValue: number;
  active: boolean;
}

function mapDoctor(r: Row): Doctor {
  return {
    id: r.id as string,
    name: r.name as string,
    qualification: r.qualification as string,
    specialty: r.specialty as string,
    nmcNo: r.nmc_no as string,
    phone: r.phone as string,
    shareBasis: r.share_basis as ShareBasis,
    shareValue: Number(r.share_value),
    active: Number(r.active) === 1,
  };
}

export async function listDoctors(includeInactive = false): Promise<Doctor[]> {
  const sql = includeInactive
    ? "SELECT * FROM doctors ORDER BY active DESC, name ASC"
    : "SELECT * FROM doctors WHERE active = 1 ORDER BY name ASC";
  const res = await db().execute(sql);
  return res.rows.map(mapDoctor);
}

export async function getDoctor(id: string): Promise<Doctor | null> {
  const res = await db().execute({
    sql: "SELECT * FROM doctors WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapDoctor(res.rows[0]) : null;
}

export async function createDoctor(input: DoctorInput): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO doctors
            (id, name, qualification, specialty, nmc_no, phone,
             share_basis, share_value, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.qualification,
      input.specialty,
      input.nmcNo,
      input.phone,
      input.shareBasis,
      input.shareValue,
      input.active ? 1 : 0,
      now,
      now,
    ],
  });
  return id;
}

/**
 * Editing a doctor changes what they earn from here on. It never moves money
 * already earned: every bill line carries its own snapshot of the basis and
 * value that were in force when it was billed.
 */
export async function updateDoctor(id: string, input: DoctorInput): Promise<void> {
  await db().execute({
    sql: `UPDATE doctors
             SET name = ?, qualification = ?, specialty = ?, nmc_no = ?, phone = ?,
                 share_basis = ?, share_value = ?, active = ?, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name,
      input.qualification,
      input.specialty,
      input.nmcNo,
      input.phone,
      input.shareBasis,
      input.shareValue,
      input.active ? 1 : 0,
      new Date().toISOString(),
      id,
    ],
  });
}
