import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureDeafness implements IAbility {
    private static instance: CureDeafness;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cure Deafness";
        this.helpFile = `
cure deafness
Syntax: c 'cure deafness' <target>

Cure deafness allows a priest to cure those that are temporarily deaf
(generally through magic).
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CureDeafness.instance === undefined) {
            CureDeafness.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CureDeafness {
        if (!CureDeafness.instance) {
            CureDeafness.instance = new CureDeafness();
        }
        return CureDeafness.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CureDeafness.GetInstance() as T;
    }
}

export default CureDeafness;