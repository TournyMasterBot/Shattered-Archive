import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class GreenLeaf implements IAbility {
    private static instance: GreenLeaf;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Green Leaf";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
Green Leaf - A song of haphazard whimsy that distracts the mind of the 
target and able to cause amusing effects such as blurred vision and
hallucinations as well as the inability to pick up or wear items.
`;
        this.manualDescription = "Have you ever wanted to make your enemies insane? Well, try some green leaf.";

        if (GreenLeaf.instance === undefined) {
            GreenLeaf.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): GreenLeaf {
        if (!GreenLeaf.instance) {
            GreenLeaf.instance = new GreenLeaf();
        }
        return GreenLeaf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return GreenLeaf.GetInstance() as T;
    }
}

export default GreenLeaf;