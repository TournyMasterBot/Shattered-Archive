import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Deeproot implements IAbility {
    private static instance: Deeproot;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Deeproot";
        this.helpFile = `
help arboren
DEEPROOT allows the Arboren to root into the earth making them almost immune to being stunned.
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.manualDescription = "";

        if (Deeproot.instance === undefined) {
            Deeproot.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Deeproot {
        if (!Deeproot.instance) {
            Deeproot.instance = new Deeproot();
        }
        return Deeproot.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Deeproot.GetInstance() as T;
    }
}

export default Deeproot;