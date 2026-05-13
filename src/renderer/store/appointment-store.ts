import { create } from 'zustand';

export interface AppointmentItem {
  serviceId: string;
  serviceName: string;
  price: string;
  quantity: number;
  total: string;
}

interface AppointmentState {
  items: AppointmentItem[];
  patientId: string | null;
  doctorId: string | null;
  appointmentDate: string;
  notes: string;

  addItem: (service: { id: string; name: string; price: string | number }) => void;
  removeItem: (serviceId: string) => void;
  updateQuantity: (serviceId: string, qty: number) => void;
  setPatient: (id: string) => void;
  setDoctor: (id: string) => void;
  setDate: (date: string) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
  getTotal: () => number;
}

export const useAppointmentStore = create<AppointmentState>((set, get) => ({
  items: [],
  patientId: null,
  doctorId: null,
  appointmentDate: new Date().toISOString().slice(0, 16),
  notes: '',

  addItem: (service) => {
    const { items } = get();
    const existing = items.find((i) => i.serviceId === service.id);
    const price = typeof service.price === 'string' ? service.price : String(service.price);

    if (existing) {
      set({
        items: items.map((i) =>
          i.serviceId === service.id
            ? { ...i, quantity: i.quantity + 1, total: String(Number(price) * (i.quantity + 1)) }
            : i
        ),
      });
    } else {
      set({
        items: [
          ...items,
          {
            serviceId: service.id,
            serviceName: service.name,
            price,
            quantity: 1,
            total: price,
          },
        ],
      });
    }
  },

  removeItem: (serviceId) => {
    set({ items: get().items.filter((i) => i.serviceId !== serviceId) });
  },

  updateQuantity: (serviceId, qty) => {
    if (qty <= 0) {
      set({ items: get().items.filter((i) => i.serviceId !== serviceId) });
      return;
    }
    set({
      items: get().items.map((i) =>
        i.serviceId === serviceId
          ? { ...i, quantity: qty, total: String(Number(i.price) * qty) }
          : i
      ),
    });
  },

  setPatient: (id) => set({ patientId: id }),
  setDoctor: (id) => set({ doctorId: id }),
  setDate: (date) => set({ appointmentDate: date }),
  setNotes: (notes) => set({ notes }),

  clear: () =>
    set({
      items: [],
      patientId: null,
      doctorId: null,
      appointmentDate: new Date().toISOString().slice(0, 16),
      notes: '',
    }),

  getTotal: () => {
    return get().items.reduce((sum, item) => sum + Number(item.total), 0);
  },
}));
