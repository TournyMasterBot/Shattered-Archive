import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class TorchBurns implements IAbility {
    private static instance: TorchBurns;

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
        this.name = "The Torch Burns";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
The Torch Burns - Singing this simple song will allow those who are 
musically inclined to make a temporary flaming torch out of midair and 
place it in their inventory.
`;
        this.manualDescription = `
Places a torch in your inventory
`;

        if (TorchBurns.instance === undefined) {
            TorchBurns.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): TorchBurns {
        if (!TorchBurns.instance) {
            TorchBurns.instance = new TorchBurns();
        }
        return TorchBurns.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return TorchBurns.GetInstance() as T;
    }
}

export default TorchBurns;