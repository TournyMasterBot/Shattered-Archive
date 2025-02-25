import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import DetectEvil from "@shared/types/ability-types/spells/detect-evil";
import DetectInvis from "@shared/types/ability-types/spells/detect-invis";
import Farsight from "@shared/types/ability-types/spells/farsight";
import LocateObject from "@shared/types/ability-types/spells/locate-object";
import DetectGood from "@shared/types/ability-types/spells/detect-good";
import DetectMagic from "@shared/types/ability-types/spells/detect-magic";
import Identify from "@shared/types/ability-types/spells/identify";
import KnowLanguages from "@shared/types/ability-types/spells/know-languages";
import DetectHidden from "@shared/types/ability-types/spells/detect-hidden";
import DetectPoison from "@shared/types/ability-types/spells/detect-poison";
import KnowAlignment from "@shared/types/ability-types/spells/know-alignment";

export class Detection implements IAbilityGroup {
  static instance: Detection;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Detection;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      DetectEvil.GetInstance(),
      DetectInvis.GetInstance(),
      Farsight.GetInstance(),
      LocateObject.GetInstance(),
      DetectGood.GetInstance(),
      DetectMagic.GetInstance(),
      Identify.GetInstance(),
      KnowLanguages.GetInstance(),
      DetectHidden.GetInstance(),
      DetectPoison.GetInstance(),
      KnowAlignment.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Detection {
    if (!Detection.instance) {
      Detection.instance = new Detection();
    }
    return Detection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Detection.GetInstance() as T;
  }
}

export default Detection;
