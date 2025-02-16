import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelCurse implements IAbility {
    private static instance: DispelCurse;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Dispel Curse";
        this.helpFile = `
dispel curse
Syntax: c 'dispel curse' <object>

Dispel curse allows the priest to permanently remove a curse from a given
object.
`;
        this.manualDescription = "Often confused with 'remove curse' which will temporarily remove the curse, this one is the permanent version.";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DispelCurse.instance === undefined) {
            DispelCurse.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DispelCurse {
        if (!DispelCurse.instance) {
            DispelCurse.instance = new DispelCurse();
        }
        return DispelCurse.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DispelCurse.GetInstance() as T;
    }
}

export default DispelCurse;