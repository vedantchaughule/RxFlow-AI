import { Schema, model, type Document, type Types } from 'mongoose';

export interface ITemplateMedicine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface IPrescriptionTemplate extends Document {
  clinicId: Types.ObjectId;
  doctorId: Types.ObjectId;
  title: string;
  diagnosis: string;
  doctorNotes?: string;
  medicines: ITemplateMedicine[];
  createdAt: Date;
  updatedAt: Date;
}

const templateMedicineSchema = new Schema<ITemplateMedicine>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    dosage: { type: String, required: true, trim: true, maxlength: 100 },
    frequency: { type: String, required: true, trim: true, maxlength: 100 },
    duration: { type: String, required: true, trim: true, maxlength: 100 },
    instructions: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

const prescriptionTemplateSchema = new Schema<IPrescriptionTemplate>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    diagnosis: { type: String, required: true, trim: true, maxlength: 1000 },
    doctorNotes: { type: String, trim: true, maxlength: 2000, default: '' },
    medicines: { type: [templateMedicineSchema], default: [] },
  },
  { timestamps: true }
);

prescriptionTemplateSchema.index({ clinicId: 1, doctorId: 1, title: 1 }, { unique: true });

export const PrescriptionTemplate = model<IPrescriptionTemplate>('PrescriptionTemplate', prescriptionTemplateSchema);
