import { model, models, Schema, Types } from "mongoose";
import {
  BillingCycle,
  EgyptPaymentMethod,
  PlanType,
} from "@/lib/subscription-constants";

export interface IUserSubscription {
  clerkId: string;
  plan: PlanType;
  billingCycle: BillingCycle;
  paymentMethod: EgyptPaymentMethod | "clerk" | "manual";
  status: "active" | "expired" | "cancelled";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  lastPaymentRequestId?: Types.ObjectId;
  activatedBy?: string;
  notes?: string;
}

const UserSubscriptionSchema = new Schema<IUserSubscription>(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    plan: {
      type: String,
      enum: ["free", "standard", "pro"],
      default: "free",
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["vodafone_cash", "instapay", "clerk", "manual"],
      default: "vodafone_cash",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      required: true,
      index: true,
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true, index: true },
    lastPaymentRequestId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPaymentRequest",
    },
    activatedBy: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

UserSubscriptionSchema.index({ clerkId: 1, status: 1, currentPeriodEnd: 1 });

const UserSubscription =
  models.UserSubscription ||
  model<IUserSubscription>("UserSubscription", UserSubscriptionSchema);

export default UserSubscription;
