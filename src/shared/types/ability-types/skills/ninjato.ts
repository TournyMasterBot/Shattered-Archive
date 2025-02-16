import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Ninjato implements IAbility {
    private static instance: Ninjato;

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
        this.name = "Ninjato";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.helpFile = `NINJATO

Syntax: Passive Skill

The path of a ninja is a dedicated one, focused upon the nuances of their
trade.  One of the primary tools of a ninja is the sword, a weapon that they
train to wield with singular intensity.  When wielding a single sword, a
ninja can seize opportunities in the heat of battle to make additional
attacks, taking advantage of every opening to slay their foe.  This is a
passive skill, born of diligent training and keen awareness.  

SEE ALSO:  NINJA`;

        if (Ninjato.instance === undefined) {
            Ninjato.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Ninjato {
        if (!Ninjato.instance) {
            Ninjato.instance = new Ninjato();
        }
        return Ninjato.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Ninjato.GetInstance() as T;
    }
}

export default Ninjato;