import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PrayRecall implements IAbility {
  private static instance: PrayRecall;

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
    this.name = "PrayRecall";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help prayrecall
PRAYRECALL

Syntax: prayrecall

Barbarians continue to make progress in developing their skills and have
discovered that when they focus their concentration fully, they have a
measured success in praying for recall to bring them back to the Temple
within their home kingdom. However, due to the Barbarian's natural heathen
instinct, this does take an incredible amount of effort and energy on their
part, often times finding little success though when achieved, the results
leave them quite tired, draining them considerably in their attempts to
move.

Groups containing this skill: BARBARIAN DEFAULT 
        `;

    if (PrayRecall.instance === undefined) {
      PrayRecall.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PrayRecall {
    if (!PrayRecall.instance) {
      PrayRecall.instance = new PrayRecall();
    }
    return PrayRecall.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PrayRecall.GetInstance() as T;
  }
}

export default PrayRecall;
