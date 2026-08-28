/**
 * strings.ts — all user-visible strings for POS and common actions.
 * Enables the English/Nepali label toggle later. Never hardcode repeated labels in JSX.
 * ABSOLUTE RULE: plain language only. No backend vocabulary (Rules.md §1).
 */

import { DEFAULT_APP_NAME } from "@/lib/app-name";

export const strings = {
  // brand — derived from the enabled modules (D-025). Screens that know the
  // module flags should call appNameFor(); this default covers the rest.
  appName: DEFAULT_APP_NAME,

  // common actions
  save: "Save",
  cancel: "Cancel",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
  search: "Search",
  print: "Print",
  back: "Back",
  close: "Close",
  confirm: "Confirm",

  // auth
  login: "Log in",
  logout: "Log out",
  username: "Username",
  password: "Password",
  pin: "PIN",
  switchUser: "Switch user",
  wrongLogin: "Wrong username or password. Please try again.",
  wrongPin: "That PIN didn't match. Try again.",

  // status / connectivity (plain language only)
  saved: "Saved",
  billSaved: "Bill saved",
  online: "Online",
  offline: "Working offline",
  offlineWaiting: (n: number) =>
    `Working offline — ${n} ${n === 1 ? "bill" : "bills"} waiting to send`,
  couldNotSave: "Couldn't save — check your connection and try again",
  somethingWentWrong: "Something went wrong. Please try again.",
  nothingHereYet: "Nothing here yet",

  // company / settings
  companyDetails: "Company details",
  pharmacyName: "Pharmacy name",
  address: "Address",
  phone: "Phone",
  panNumber: "PAN number",
  ddaNumber: "DDA registration number",
  vatRegistered: "VAT registered",
  invoiceFooter: "Invoice footer message",
  printFormat: "Print format",
  expiryAlertWindow: "Near-expiry alert window",
  roundGrandTotal: "Round grand total to nearest rupee",
  minRateIsCost: "Warn when a rate is below what you paid",

  // users
  users: "Users",
  addUser: "Add user",
  fullName: "Full name",
  role: "Role",
  roleAdmin: "Admin (Owner)",
  roleStaff: "Staff (Counter)",
  canEditRate: "Can edit rate on bill",
  active: "Active",

  // empty states
  emptyStock: "No items yet. Add your first medicine to start tracking stock.",
  emptyUsers: "No users yet. Add your first user to get started.",
} as const;

/** Nepali labels for the core POS actions (toggleable later). */
export const npLabels = {
  newBill: "नयाँ बिल",
  save: "सुरक्षित",
  billSaved: "बिल बन्यो",
} as const;
