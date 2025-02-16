import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RighteousJudgement implements IAbility {
    private static instance: RighteousJudgement;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Righteous Judgement";
        this.helpFile = `
            // Add description here
        `;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (RighteousJudgement.instance === undefined) {
            RighteousJudgement.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): RighteousJudgement {
        if (!RighteousJudgement.instance) {
            RighteousJudgement.instance = new RighteousJudgement();
        }
        return RighteousJudgement.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return RighteousJudgement.GetInstance() as T;
    }
}

export default RighteousJudgement;