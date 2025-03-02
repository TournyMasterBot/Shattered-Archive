import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ShieldStrike implements IAbility {
  private static instance: ShieldStrike;

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
    this.helpFile = `help shield strike
shield strike
SHIELD STRIKE
syntax:  shield strike <target>
A trained paladin or barbarian can learn to use his shield as well as weapons
effectively in combat.  By using his momentum and physical strength, the
paladin or barbarian can learn to swing a shield with great force into the body
of an opponent causing damage from the crush.  Shield strike may be used to
initiate combat or used without indicating a target while in battle to attack
the opponent engaged with.`;

    if (ShieldStrike.instance === undefined) {
      ShieldStrike.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShieldStrike {
    if (!ShieldStrike.instance) {
      ShieldStrike.instance = new ShieldStrike();
    }
    return ShieldStrike.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShieldStrike.GetInstance() as T;
  }
}

export default ShieldStrike;
