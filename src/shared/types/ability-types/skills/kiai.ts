import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Kiai implements IAbility {
    private static instance: Kiai;

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
        this.name = "Kiai";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help Kiai
kiai
KIAI

Syntax: Kiai <target>

The Samurai musters his inner strength and lets out a guttural shout as he
charges his enemy. The raw power a Samurai puts into this technique can
stun enemies as well as fortify their own strength, however it's exhausting
and once successful cannot be done again until the Samurai has had time to
regain his strength.`;
        this.manualDescription = "KIAI! KIAI! KIAI!";

        if (Kiai.instance === undefined) {
            Kiai.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Kiai {
        if (!Kiai.instance) {
            Kiai.instance = new Kiai();
        }
        return Kiai.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Kiai.GetInstance() as T;
    }
}

export default Kiai;