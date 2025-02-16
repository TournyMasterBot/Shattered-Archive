import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Flurry implements IAbility {
    private static instance: Flurry;

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
        this.name = "Flurry";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help Flurry
mastery sword florentine flurry cross
Mastery of the Sword

An armsman whom has mastered the discipline of the sword can leverage powerful
gladiatorial skill against an opponent. An armsman may understand and utilize the
following skills as a master of the sword:

florentine     The armsman retains a higher aptitude for defense while using
               two swords.
flurry         Summoning a burst of energy, the armsman makes a powerful
               rushing attack with their swords.
cross          While using two swords, the armsman may push down their
               opponent's weapon by crossing their own swords to create an
               opening to land a devastating kick.

This group is available to the following classes: ARMSMAN
`;

        if (Flurry.instance === undefined) {
            Flurry.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Flurry {
        if (!Flurry.instance) {
            Flurry.instance = new Flurry();
        }
        return Flurry.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Flurry.GetInstance() as T;
    }
}

export default Flurry;