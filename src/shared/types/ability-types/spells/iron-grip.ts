import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class IronGrip implements IAbility {
    private static instance: IronGrip;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Iron Grip";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (IronGrip.instance === undefined) {
            IronGrip.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): IronGrip {
        if (!IronGrip.instance) {
            IronGrip.instance = new IronGrip();
        }
        return IronGrip.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return IronGrip.GetInstance() as T;
    }
}

export default IronGrip;