import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FakeIllness implements IAbility {
    private static instance: FakeIllness;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Fake Illness";
        this.helpFile = `
FAKE ILLNESS

A spell to make Devion envy, fake illness allows the mentalist to cause an assault
on the mind in such a way that his or her enemy will believe they are suffering
from some sort of illness or injury and, in general, resulting in a weaker and 
slower opponent. This spell gains power as the mentalist gains level.

Syntax :  cast 'fake illness' <target>
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (FakeIllness.instance === undefined) {
            FakeIllness.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): FakeIllness {
        if (!FakeIllness.instance) {
            FakeIllness.instance = new FakeIllness();
        }
        return FakeIllness.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return FakeIllness.GetInstance() as T;
    }
}

export default FakeIllness;