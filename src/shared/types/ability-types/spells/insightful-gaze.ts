import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class InsightfulGaze implements IAbility {
    private static instance: InsightfulGaze;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Insightful Gaze";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (InsightfulGaze.instance === undefined) {
            InsightfulGaze.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): InsightfulGaze {
        if (!InsightfulGaze.instance) {
            InsightfulGaze.instance = new InsightfulGaze();
        }
        return InsightfulGaze.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return InsightfulGaze.GetInstance() as T;
    }
}

export default InsightfulGaze;