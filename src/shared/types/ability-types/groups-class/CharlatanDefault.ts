import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import DangerSense from "@shared/types/ability-types/skills/DangerSense";
import DirtKicking from "@shared/types/ability-types/skills/DirtKicking";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import EyeGouge from "@shared/types/ability-types/skills/EyeGouge";
import Fake from "@shared/types/ability-types/skills/Fake";
import Hide from "@shared/types/ability-types/skills/Hide";
import Instigate from "@shared/types/ability-types/skills/Instigate";
import Lore from "@shared/types/ability-types/skills/Lore";
import Parry from "@shared/types/ability-types/skills/Parry";
import Peek from "@shared/types/ability-types/skills/Peek";
import Pretend from "@shared/types/ability-types/skills/Pretend";
import Rack from "@shared/types/ability-types/skills/Rack";
import Sap from "@shared/types/ability-types/skills/Sap";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import Swindle from "@shared/types/ability-types/skills/Swindle";
import Trip from "@shared/types/ability-types/skills/Trip";
import Turncoat from "@shared/types/ability-types/skills/Turncoat";
import ServerCache from "@shared/cache/server-cache";

export class CharlatanDefault implements IAbilityGroup {
  static instance: CharlatanDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.CharlatanDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      DirtKicking.GetInstance(),
      Sneak.GetInstance(),
      Lore.GetInstance(),
      Swindle.GetInstance(),
      Instigate.GetInstance(),
      DangerSense.GetInstance(),
      Dodge.GetInstance(),
      Trip.GetInstance(),
      Hide.GetInstance(),
      Rack.GetInstance(),
      Turncoat.GetInstance(),
      Pretend.GetInstance(),
      Parry.GetInstance(),
      Peek.GetInstance(),
      Fake.GetInstance(),
      Sap.GetInstance(),
      EyeGouge.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): CharlatanDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CharlatanDefault.GetInstance() as T;
  }
}

export default CharlatanDefault;
