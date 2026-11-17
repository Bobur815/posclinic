import {
  ArrowUpCircle,
  CloudUpload,
  CreditCard,
  Network,
  Printer,
  Receipt,
  ReceiptText,
  Settings,
  Shapes,
  Stethoscope,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { ClinicWorkflowSection } from './ClinicWorkflowSection';
import { CloudSyncSection } from './CloudSyncSection';
import { FiscalSection } from './FiscalSection';
import { GeneralSettings } from './GeneralSettings';
import { LanSection } from './LanSection';
import { PrinterSection } from './PrinterSection';
import { ReceiptSection } from './ReceiptSection';
import { SubscriptionSection } from './SubscriptionSection';
import { TypesSection } from './TypesSection';
import { UpdateSection } from './UpdateSection';

/**
 * The settings sections (as posgro's settings tiles): each is a tile on Settings and its own page
 * at /settings/<key>. `mainOnly`: the licence, cloud sync and the fiscal device belong to the
 * main till; a satellite does not show them (its calls go to the main till anyway).
 */
export interface SettingsSection {
  key: string;
  icon: ReactNode;
  /** i18n key of the title (the section's own heading). */
  title: string;
  /** i18n key of the tile's one-line description. */
  description: string;
  component: ComponentType;
  mainOnly?: boolean;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: 'general',
    icon: <Settings size={30} />,
    title: 'settings.general',
    description: 'settings.tiles.general',
    component: GeneralSettings,
  },
  {
    key: 'clinic',
    icon: <Stethoscope size={30} />,
    title: 'clinicSettings.title',
    description: 'settings.tiles.clinic',
    component: ClinicWorkflowSection,
  },
  {
    key: 'printer',
    icon: <Printer size={30} />,
    title: 'printing.title',
    description: 'settings.tiles.printer',
    component: PrinterSection,
  },
  {
    key: 'receipt',
    icon: <ReceiptText size={30} />,
    title: 'receiptSettings.title',
    description: 'settings.tiles.receipt',
    component: ReceiptSection,
  },
  {
    key: 'types',
    icon: <Shapes size={30} />,
    title: 'types.title',
    description: 'settings.tiles.types',
    component: TypesSection,
  },
  {
    key: 'fiscal',
    icon: <Receipt size={30} />,
    title: 'fiscal.title',
    description: 'settings.tiles.fiscal',
    component: FiscalSection,
    mainOnly: true,
  },
  {
    key: 'subscription',
    icon: <CreditCard size={30} />,
    title: 'license.title',
    description: 'settings.tiles.subscription',
    component: SubscriptionSection,
    mainOnly: true,
  },
  {
    key: 'sync',
    icon: <CloudUpload size={30} />,
    title: 'sync.title',
    description: 'settings.tiles.sync',
    component: CloudSyncSection,
    mainOnly: true,
  },
  {
    key: 'lan',
    icon: <Network size={30} />,
    title: 'lan.title',
    description: 'settings.tiles.lan',
    component: LanSection,
  },
  {
    key: 'update',
    icon: <ArrowUpCircle size={30} />,
    title: 'update.title',
    description: 'settings.tiles.update',
    component: UpdateSection,
  },
];
