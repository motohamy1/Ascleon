import { model, Schema, models } from "mongoose";

export interface IUserUsage {
  clerkId: string;
  billingPeriodStart: Date;
  pagesUsed: number;
  creditsUsed: number;
  voiceMinutesUsed: number;
}

const UserUsageSchema = new Schema<IUserUsage>(
  {
    clerkId: { type: String, required: true, index: true },
    billingPeriodStart: { type: Date, required: true, index: true },
    pagesUsed: { type: Number, default: 0, required: true },
    creditsUsed: { type: Number, default: 0, required: true },
    voiceMinutesUsed: { type: Number, default: 0, required: true },
  },
  { timestamps: true },
);

UserUsageSchema.index({ clerkId: 1, billingPeriodStart: 1 }, { unique: true });

const UserUsage =
  models.UserUsage || model<IUserUsage>("UserUsage", UserUsageSchema);

export default UserUsage;
