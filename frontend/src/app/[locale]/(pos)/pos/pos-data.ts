export interface Product {
  id: string;
  medicine_id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  batch: string;
  lot_number: string;
  expiry: string;
  requires_prescription: boolean;
  favorite: boolean;
}

export const categories = [
  'All', 'Medicines', 'Antibiotics', 'Pain Relief', 'Vitamins',
  'Respiratory', 'Cardiovascular', 'Diabetes', 'Skin Care', 'Other'
];

export const mockProducts: Product[] = [
  // Medicines
  { id: 'p1', medicine_id: 'm1', name: 'Metformin 500mg + Glimepiride 2mg', category: 'Medicines', price: 450, stock: 120, batch: 'B-001', lot_number: '000001', expiry: '12/2027', requires_prescription: true, favorite: true },
  { id: 'p2', medicine_id: 'm2', name: 'Perindopril 5mg + Indapamide 1.25mg', category: 'Medicines', price: 550, stock: 85, batch: 'B-002', lot_number: '000002', expiry: '06/2028', requires_prescription: true, favorite: false },
  { id: 'p3', medicine_id: 'm3', name: 'Atorvastatin 10mg', category: 'Medicines', price: 300, stock: 200, batch: 'B-003', lot_number: '000003', expiry: '01/2026', requires_prescription: true, favorite: true },
  { id: 'p4', medicine_id: 'm4', name: 'Atorvastatin 20mg', category: 'Medicines', price: 400, stock: 150, batch: 'B-003', lot_number: '000004', expiry: '01/2026', requires_prescription: true, favorite: false },

  // Antibiotics
  { id: 'p5', medicine_id: 'm5', name: 'Amoxicillin 500mg', category: 'Antibiotics', price: 250, stock: 300, batch: 'B-004', lot_number: 'Lot-9854', expiry: '11/2025', requires_prescription: true, favorite: true },
  { id: 'p6', medicine_id: 'm6', name: 'Azithromycin 250mg', category: 'Antibiotics', price: 350, stock: 50, batch: 'B-005', lot_number: 'Lot-9855', expiry: '03/2026', requires_prescription: true, favorite: false },
  { id: 'p7', medicine_id: 'm7', name: 'Ciprofloxacin 500mg', category: 'Antibiotics', price: 400, stock: 90, batch: 'B-006', lot_number: 'Lot-9856', expiry: '08/2027', requires_prescription: true, favorite: false },

  // Pain Relief
  { id: 'p8', medicine_id: 'm8', name: 'Acetylsalicylic Acid 75mg', category: 'Pain Relief', price: 150, stock: 400, batch: 'B-007', lot_number: '000005', expiry: '05/2028', requires_prescription: false, favorite: true },
  { id: 'p9', medicine_id: 'm9', name: 'Acetylsalicylic Acid 80mg Gastro-Resistant', category: 'Pain Relief', price: 180, stock: 250, batch: 'B-007', lot_number: '000006', expiry: '05/2028', requires_prescription: false, favorite: false },
  { id: 'p10', medicine_id: 'm10', name: 'Acetylsalicylic Acid 160mg Gastro-Resistant', category: 'Pain Relief', price: 220, stock: 180, batch: 'B-008', lot_number: '000007', expiry: '09/2026', requires_prescription: false, favorite: false },
  { id: 'p11', medicine_id: 'm11', name: 'Paracetamol 500mg', category: 'Pain Relief', price: 50, stock: 500, batch: 'B-009', lot_number: '000008', expiry: '12/2028', requires_prescription: false, favorite: true },
  { id: 'p12', medicine_id: 'm12', name: 'Ibuprofen 400mg', category: 'Pain Relief', price: 120, stock: 350, batch: 'B-010', lot_number: '000009', expiry: '07/2027', requires_prescription: false, favorite: true },

  // Vitamins
  { id: 'p13', medicine_id: 'm13', name: 'Ascorbic Acid 500mg', category: 'Vitamins', price: 100, stock: 450, batch: 'B-011', lot_number: '000010', expiry: '10/2026', requires_prescription: false, favorite: true },
  { id: 'p14', medicine_id: 'm14', name: 'B Vitamins Formula', category: 'Vitamins', price: 250, stock: 120, batch: 'B-012', lot_number: '000011', expiry: '04/2027', requires_prescription: false, favorite: false },
  { id: 'p15', medicine_id: 'm15', name: 'Vitamin D3 1000 IU', category: 'Vitamins', price: 180, stock: 200, batch: 'B-013', lot_number: '000012', expiry: '02/2028', requires_prescription: false, favorite: true },
  { id: 'p16', medicine_id: 'm16', name: 'Multivitamin Supplements', category: 'Vitamins', price: 300, stock: 80, batch: 'B-014', lot_number: '000013', expiry: '11/2025', requires_prescription: false, favorite: false },

  // Respiratory
  { id: 'p17', medicine_id: 'm17', name: 'Aminosidine 125mg/5ml', category: 'Respiratory', price: 280, stock: 60, batch: 'B-015', lot_number: '000014', expiry: '06/2026', requires_prescription: true, favorite: false },
  { id: 'p18', medicine_id: 'm18', name: 'Aminosidine 250mg', category: 'Respiratory', price: 420, stock: 45, batch: 'B-016', lot_number: '000015', expiry: '06/2026', requires_prescription: true, favorite: false },
  { id: 'p19', medicine_id: 'm19', name: 'Salbutamol Inhaler 100mcg', category: 'Respiratory', price: 150, stock: 150, batch: 'B-017', lot_number: '000016', expiry: '01/2027', requires_prescription: true, favorite: true },

  // Cardiovascular
  { id: 'p20', medicine_id: 'm20', name: 'Atenolol 25mg', category: 'Cardiovascular', price: 200, stock: 110, batch: 'B-018', lot_number: '000017', expiry: '03/2028', requires_prescription: true, favorite: false },
  { id: 'p21', medicine_id: 'm21', name: 'Atenolol 50mg', category: 'Cardiovascular', price: 250, stock: 130, batch: 'B-018', lot_number: '000018', expiry: '03/2028', requires_prescription: true, favorite: true },
  { id: 'p22', medicine_id: 'm22', name: 'Atenolol 100mg', category: 'Cardiovascular', price: 300, stock: 90, batch: 'B-019', lot_number: '000019', expiry: '05/2027', requires_prescription: true, favorite: false },
  { id: 'p23', medicine_id: 'm23', name: 'Amlodipine 5mg', category: 'Cardiovascular', price: 180, stock: 220, batch: 'B-020', lot_number: '000020', expiry: '11/2026', requires_prescription: true, favorite: true },
  { id: 'p24', medicine_id: 'm24', name: 'Amlodipine 10mg', category: 'Cardiovascular', price: 220, stock: 190, batch: 'B-020', lot_number: '000021', expiry: '11/2026', requires_prescription: true, favorite: false },
  { id: 'p25', medicine_id: 'm25', name: 'Amlodipine 5mg+Losartan 50mg', category: 'Cardiovascular', price: 400, stock: 150, batch: 'B-021', lot_number: '000022', expiry: '08/2027', requires_prescription: true, favorite: true },
  { id: 'p26', medicine_id: 'm26', name: 'Amlodipine 2.5mg+Hydrochlorothiazide 12.5mg', category: 'Cardiovascular', price: 350, stock: 75, batch: 'B-022', lot_number: '000023', expiry: '10/2025', requires_prescription: true, favorite: false },

  // Diabetes
  { id: 'p27', medicine_id: 'm27', name: 'Metformin 850mg', category: 'Diabetes', price: 200, stock: 300, batch: 'B-023', lot_number: '000024', expiry: '09/2028', requires_prescription: true, favorite: true },
  { id: 'p28', medicine_id: 'm28', name: 'Glimepiride 4mg', category: 'Diabetes', price: 180, stock: 140, batch: 'B-024', lot_number: '000025', expiry: '02/2027', requires_prescription: true, favorite: false },

  // Skin Care
  { id: 'p29', medicine_id: 'm29', name: 'Benzoyl Peroxide 5%', category: 'Skin Care', price: 450, stock: 65, batch: 'B-025', lot_number: '000026', expiry: '07/2026', requires_prescription: false, favorite: true },
  { id: 'p30', medicine_id: 'm30', name: 'Benzoyl Peroxide 10%', category: 'Skin Care', price: 550, stock: 40, batch: 'B-026', lot_number: '000027', expiry: '07/2026', requires_prescription: false, favorite: false },
  { id: 'p31', medicine_id: 'm31', name: 'Azelaic Acid 20%', category: 'Skin Care', price: 600, stock: 80, batch: 'B-027', lot_number: '000028', expiry: '12/2025', requires_prescription: false, favorite: true },
  { id: 'p32', medicine_id: 'm32', name: 'Acitretin 25mg', category: 'Skin Care', price: 900, stock: 25, batch: 'B-028', lot_number: '000029', expiry: '04/2028', requires_prescription: true, favorite: false },

  // Other
  { id: 'p33', medicine_id: 'm33', name: 'Activated Charcoal 125mg tablet', category: 'Other', price: 150, stock: 120, batch: 'B-029', lot_number: '000030', expiry: '01/2029', requires_prescription: false, favorite: false },
  { id: 'p34', medicine_id: 'm34', name: 'Antihemorrhoids Preparations', category: 'Other', price: 320, stock: 85, batch: 'B-030', lot_number: '000031', expiry: '05/2026', requires_prescription: false, favorite: true },
  { id: 'p35', medicine_id: 'm35', name: 'Adarone Chlorhydrate 200mg', category: 'Other', price: 480, stock: 30, batch: 'B-031', lot_number: '000032', expiry: '08/2027', requires_prescription: true, favorite: false },
  { id: 'p36', medicine_id: 'm36', name: 'Adapalene 0.1%', category: 'Other', price: 750, stock: 55, batch: 'B-032', lot_number: '000033', expiry: '11/2026', requires_prescription: true, favorite: true },
];

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
}

export const mockCustomers: Customer[] = [
  { id: 'c1', name: 'Ahmed Ali', phone: '0912 345 678', balance: 0 },
  { id: 'c2', name: 'Mohammed Hassan', phone: '0999 123 456', balance: 250 },
  { id: 'c3', name: 'Fatima Omar', phone: '0911 222 333', balance: 1500 },
  { id: 'c4', name: 'Sara Ibrahim', phone: '0922 444 555', balance: 0 },
  { id: 'c5', name: 'Khalid Youssef', phone: '0933 666 777', balance: 800 },
];
