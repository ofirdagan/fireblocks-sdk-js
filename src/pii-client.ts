import PIIsdk, {
    AgentType,
    initAgent,
    PIIEncryptionMethod,
} from "@notabene/pii-sdk";
import { TransactionArguments, TravelRuleOptions } from "./types";

export class PIIEncryption {
    private readonly config: TravelRuleOptions;
    public toolset: PIIsdk;

    constructor(config: TravelRuleOptions) {
        this.config = config;
        const requiredFields = [
            "kmsSecretKey",
            "baseURLPII",
            "audiencePII",
            "clientId",
            "clientSecret",
            "authURL",
            "jsonDidKey",
        ];
        const missingFields = requiredFields.filter(
            (field) => !(field in this.config)
        );

        if (missingFields.length > 0) {
            throw new Error(
                `Missing configuration fields: ${missingFields.join(", ")}`
            );
        }

        this.toolset = new PIIsdk({
            kmsSecretKey: config.kmsSecretKey,
            piiURL: config.baseURLPII,
            audience: config.audiencePII,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            authURL: config.authURL,
        });
    }

    async hybridEncode(transaction: TransactionArguments) {
        const { travelRuleMessage } = transaction;
        const pii = travelRuleMessage.pii || {
            originator: travelRuleMessage.originator,
            beneficiary: travelRuleMessage.beneficiary,
        };
        const { jsonBeneficiaryDidKey, jsonDidKey, kmsSecretKey } = this.config;
        const counterpartyDIDKey = jsonBeneficiaryDidKey || undefined;

        let piiIvms;
        let agent;

        try {
            agent = initAgent({ KMS_SECRET_KEY: kmsSecretKey }).agent as AgentType;
            await agent.didManagerImport(JSON.parse(jsonDidKey));
            piiIvms = await this.toolset.generatePIIField({
                pii,
                originatorVASPdid: travelRuleMessage.originatorVASPdid,
                beneficiaryVASPdid: travelRuleMessage.beneficiaryVASPdid,
                counterpartyDIDKey,
                agent,
                senderDIDKey: JSON.parse(jsonDidKey).did,
                encryptionMethod: PIIEncryptionMethod.HYBRID,
            });
        } catch (error) {
            const errorMessage = error.message || error.toString();
            const errorDetails = JSON.stringify(error);
            throw new Error(`Failed to generate PII fields error: ${errorMessage}. Details: ${errorDetails}`);
        }

        travelRuleMessage.beneficiary = piiIvms.beneficiary;
        travelRuleMessage.originator = piiIvms.originator;
        transaction.travelRuleMessage = travelRuleMessage;

        return transaction;
    }
}