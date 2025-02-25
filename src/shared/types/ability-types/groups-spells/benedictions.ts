import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Imbue from "@shared/types/ability-types/spells/imbue";
import Frenzy from "@shared/types/ability-types/spells/frenzy";
import KnowReligion from "@shared/types/ability-types/spells/know-religion";
import Bless from "@shared/types/ability-types/spells/bless";
import HolyWord from "@shared/types/ability-types/spells/holy-word";
import Calm from "@shared/types/ability-types/spells/calm";
import RemoveCurse from "@shared/types/ability-types/spells/remove-curse";

export class Benedictions implements IAbilityGroup {
  static instance: Benedictions;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Benedictions;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Imbue.GetInstance(),
      Frenzy.GetInstance(),
      KnowReligion.GetInstance(),
      Bless.GetInstance(),
      HolyWord.GetInstance(),
      Calm.GetInstance(),
      RemoveCurse.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Benedictions {
    if (!Benedictions.instance) {
      Benedictions.instance = new Benedictions();
    }
    return Benedictions.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Benedictions.GetInstance() as T;
  }
}

export default Benedictions;
