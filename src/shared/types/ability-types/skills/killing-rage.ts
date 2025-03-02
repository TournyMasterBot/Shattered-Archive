import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class KillingRage implements IAbility {
  private static instance: KillingRage;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `KILLING RAGE

Syntax: Rage

This skill is known only to Battleragers of clan Wargar and the kingdom of
Thaxanos. These dwarves have learned to induce a state of incredible rage,
much more powerful than the berserk skill of other warriors. Even
experienced Battleragers find it difficult or impossible to induce
this state unless armed with their favorite weapon type (an axe) and already
engaged in combat.

The state of rage will temporarily give the Battlerager more life force,
allow him/her an improved chance of landing blows on an opponent and
increase the amount of damage each blow does. Because they become more
focused on damaging their opponent, they lose a bit of dexterity.

SEE ALSO: BATTLERAGERS, WARGAR, THAXANOS`;

    if (KillingRage.instance === undefined) {
      KillingRage.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): KillingRage {
    if (!KillingRage.instance) {
      KillingRage.instance = new KillingRage();
    }
    return KillingRage.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return KillingRage.GetInstance() as T;
  }
}

export default KillingRage;
