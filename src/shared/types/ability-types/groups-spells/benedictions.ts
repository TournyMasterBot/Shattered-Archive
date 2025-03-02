import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Imbue from "@shared/types/ability-types/spells/Imbue";
import Frenzy from "@shared/types/ability-types/spells/Frenzy";
import KnowReligion from "@shared/types/ability-types/spells/KnowReligion";
import Bless from "@shared/types/ability-types/spells/Bless";
import HolyWord from "@shared/types/ability-types/spells/HolyWord";
import Calm from "@shared/types/ability-types/spells/Calm";
import RemoveCurse from "@shared/types/ability-types/spells/RemoveCurse";
import ServerCache from "@shared/cache/server-cache";

export class Benedictions implements IAbilityGroup {
  static instance: Benedictions;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
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
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Benedictions.GetInstance() as T;
  }
}

export default Benedictions;
