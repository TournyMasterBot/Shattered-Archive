import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Spook from "@shared/types/ability-types/spells/spook";
import Vacancy from "@shared/types/ability-types/spells/vacancy";
import ImprovedInvisibility from "@shared/types/ability-types/spells/improved-invisibility";
import Imposter from "@shared/types/ability-types/spells/imposter";
import Blur from "@shared/types/ability-types/spells/blur";
import SummonShadow from "@shared/types/ability-types/spells/summon-shadow";
import FalseImage from "@shared/types/ability-types/spells/false-image";
import Paralyze from "@shared/types/ability-types/spells/paralyze";
import MirrorImage from "@shared/types/ability-types/spells/mirror-image";
import RainbowPattern from "@shared/types/ability-types/spells/rainbow-pattern";
import Blend from "@shared/types/ability-types/spells/blend";

export class GreaterIllusions implements IAbilityGroup {
  static instance: GreaterIllusions;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.GreaterIllusions;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Spook.GetInstance(),
      Vacancy.GetInstance(),
      ImprovedInvisibility.GetInstance(),
      Imposter.GetInstance(),
      Blur.GetInstance(),
      SummonShadow.GetInstance(),
      FalseImage.GetInstance(),
      Paralyze.GetInstance(),
      MirrorImage.GetInstance(),
      RainbowPattern.GetInstance(),
      Blend.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GreaterIllusions {
    if (!GreaterIllusions.instance) {
      GreaterIllusions.instance = new GreaterIllusions();
    }
    return GreaterIllusions.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GreaterIllusions.GetInstance() as T;
  }
}

export default GreaterIllusions;
