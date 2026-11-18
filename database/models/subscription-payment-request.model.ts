import { model, models, Schema } from "mongoose";
import {
  BillingCycle,
  EgyptPaymentMethod,
  PaidPlanType,
} from "@/lib/subscription-constants";

export type PaymentRequestStatus = "pending" | "approved" | "rejected";

export interface ISubscriptionPaymentRequest {
  requestCode: string;
  clerkId: string;
  userEmail?: string;
  userName?: string;
  plan: PaidPlanType;
  billingCycle: BillingCycle;
  paymentMethod: EgyptPaymentMethod;
  amountEgp: number;
  recipientNumber: string;
  senderIdentifier: string;
  referenceNote?: string;
  status: PaymentRequestStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriptionPaymentRequestSchema =
  new Schema<ISubscriptionPaymentRequest>(
    {
      requestCode: { type: String, required: true, unique: true, index: true },
      clerkId: { type: String, required: true, index: true },
      userEmail: { type: String },
      userName: { type: String },
      plan: {
        type: String,
        enum: ["standard", "pro"],
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
        enum: ["vodafone_cash", "instapay"],
        required: true,
      },
      amountEgp: { type: Number, required: true },
      recipientNumber: { type: String, required: true },
      senderIdentifier: { type: String, required: true },
      referenceNote: { type: String },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
        required: true,
        index: true,
      },
      reviewedBy: { type: String },
      reviewedAt: { type: Date },
      reviewNote: { type: String },
    },
    { timestamps: true },
  );

SubscriptionPaymentRequestSchema.index({ clerkId: 1, createdAt: -1 });
SubscriptionPaymentRequestSchema.index({ status: 1, createdAt: -1 });

const SubscriptionPaymentRequest =
  models.SubscriptionPaymentRequest ||
  model<ISubscriptionPaymentRequest>(
    "SubscriptionPaymentRequest",
    SubscriptionPaymentRequestSchema,
  );

export default SubscriptionPaymentRequest;
