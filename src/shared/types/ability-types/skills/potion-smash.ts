import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PotionSmash implements IAbility {
    private static instance: PotionSmash;

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
        this.name = "Potion Smash";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
potionsmash
The bandit being a bit of a dirty fighter can try to snatch potions out
of a victim's inventory and smash them on the ground.  Being an unexact
science, you never know how many potions a bandit might nab from you though
holding too many potions gets harder and harder.
        `;

        if (PotionSmash.instance === undefined) {
            PotionSmash.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): PotionSmash {
        if (!PotionSmash.instance) {
            PotionSmash.instance = new PotionSmash();
        }
        return PotionSmash.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PotionSmash.GetInstance() as T;
    }
}

export default PotionSmash;