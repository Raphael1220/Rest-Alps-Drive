//Import des modules necessaires
const express = require('express');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

//Mise en place du serveur et du chemin
const app = express();
const port = 3000;
const tmpDir = os.tmpdir();


//Multer créer un disque de stockage et cet objet definit comme il va être stocké
//Storage pour la méthode PUT
const storage = multer.diskStorage({
  destination: tmpDir,

  // On definit le nom du fichier
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

//upload contient le middleware multer et peut être utilisée pour gérer les fichiers téléchargés dans les routes de l'application.
const upload = multer({ storage: storage });

//Storage pour la méthode PUT dans un dossier enfant
const parentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const parentFolderName = req.params.parentFolderName;
    const parentFolderPath = path.join(tmpDir, parentFolderName);
    
    cb(null, parentFolderPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const uploadParent = multer({ storage: parentStorage });

//Le serveur execute les fichiers du dossier frontend
app.use(express.static('frontend'));

//Méthode GET all pour récupérer l'ensemble des dossier et fichier à la racine du chemin défini
//Route HTTP GET pour l'URL '/api/drive'
//Fonction callback qui prend en paramètre res(response qui permet de définir les informations de la réponse HTTP qui sera renvoyée au client)
//Et req(request qui contienne les infos de la requete)  
app.get('/api/drive', (req, res) => {
  const path = tmpDir;

  //fs.readdir lit le contenu du répertoire path
  //withFileTypes:true permettra de récupérer les informations sur les fichiers et les répertoires sous forme d'objets fs.Dirent.
  //Fonction callback qui prend en paramètre err(gestion des erreurs)
  //et files (qui contiendra un tableau d'objets fs.Dirent représentant les fichiers et répertoires trouvés dans le répertoire spécifié)
  fs.readdir(path, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }

    //On utilise la méthode fs.statSync() pour obtenir des informations sur chaque élément dans le chemin
    //Ensuite, on mappe chaque élément du tableau
    const result = files.map((file) => {
      const filePath = path + '/' + file.name;
      const stats = fs.statSync(filePath);

      return {
        name: file.name,

        //Un booléen indiquant si l'élément est un dossier
        isFolder: file.isDirectory(),

        //La taille de l'élément en octets (seulement si c'est un fichier)
        size: stats.isFile() ? stats.size : undefined
      };
    });
    
    //Reponse de la requete en json qui renvoie 2OO si c'est OK
    res.set('Content-Type', 'application/json');
    res.status(200).json(result);
  });
});

//Méthode GET name pour récupérer l'ensemble d'un dossier à partir de la racine du chemin défini
//Route HTTP GET pour l'URL '/api/drive/:name'
app.get('/api/drive/:name', (req, res) => {
  const name = req.params.name;
  const paths = path.join(tmpDir, name);

  //Statut de l'élément
  fs.stat(paths, (err, stats) => {
    if (err) {
      // Le fichier/dossier n'existe pas, retourner une erreur 404
      res.status(404).send('Fichier/Dossier introuvable');
    } else {
      if (stats.isDirectory()) {
        // Le chemin correspond à un dossier, renvoyer une réponse JSON
        fs.readdir(paths, (err, files) => {
          if (err) {
            // Erreur de lecture du dossier, retourner une erreur 500
            res.status(500).send('Erreur de lecture du dossier');
          } else {
            const result = files.map((file) => {
              const fileStats = fs.statSync(paths + '/' + file);
              return {
                name: file,
                isFolder: fileStats.isDirectory(),
                size: fileStats.isFile() ? fileStats.size : undefined
              };
            });
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(result);
          }
        });
      } else {
        // Le chemin correspond à un fichier ou autre donnée devant etre traité comme un flux d'octets
        // En-tete HTTP
        res.setHeader('Content-Type', 'application/octet-stream');
        res.status(200);

        // createReadStream permet de renvoyé le contenu de la response
        fs.createReadStream(paths).pipe(res);
      }
    }
  });
});

//Méthode POST pour envoyer un nouvel élement au serveur
//Route HTTP POST pour l'URL '/api/drive'
app.post('/api/drive', (req, res) => {
  const folderName = req.query.name;
  if (!folderName) {
    return res.status(400).send('Le champ "name" est manquant dans le corps de la requête');
  }

  const paths = path.join(tmpDir, folderName);

  const regExp = /[^a-zA-Z0-9]/g;
  if (regExp.test(folderName)) {
    return res.status(400).send('Le nom du dossier contient des caractères non-alphanumériques');
  }

  //fs.existsSync vérifie si le chemin est deja utilisé
  if (!fs.existsSync(paths)) {

    //fs.mkdir prend en param le chemin vers le nouveau dossier à créer
    fs.mkdirSync(paths);
    res.status(201).send('Dossier créé avec succès');
  } else {
    res.status(409).send('Le dossier existe déjà');
  }
});

//Méthode POST parentFolderName pour envoyer un nouvel élement au serveur à partir d'un dossier parent
//Route HTTP POST pour l'URL '/api/drive/:parentFolderName'
app.post('/api/drive/:parentFolderName', (req, res) => {
  const parentFolderName = req.params.parentFolderName;
  if (!parentFolderName) {
    return res.status(400).send('Le nom du dossier parent est manquant dans l\'URL');
  }

  const folderName = req.query.name;
  if (!folderName) {
    return res.status(400).send('Le paramètre "name" est manquant dans l\'URL');
  }

  const paths = path.join(tmpDir, parentFolderName, folderName);

  
  const regExp = /[^a-zA-Z0-9]/g;
  if (regExp.test(folderName)) {
    return res.status(400).send('Le nom du dossier contient des caractères non-alphanumériques');
  }
  const parentFolderPath = path.join(tmpDir, parentFolderName);

  if (!fs.existsSync(parentFolderPath)) {
    return res.status(404).send('Le dossier parent n\'existe pas');
  }

  if (!fs.existsSync(paths)) {
    fs.mkdirSync(paths);
    res.status(201).send('Dossier créé avec succès');
  } else {
    res.status(409).send('Le dossier existe déjà');
  }
});

// Méthode DELETE pour supprimer un fichier ou un dossier
// Route HTTP DELETE pour l'URL '/api/drive/:name'
app.delete('/api/drive/:name', (req, res) => {
  const name = req.params.name;
  
  const paths = path.join(tmpDir, name);

  const regExp = /[^a-zA-Z0-9]/g;
  if (regExp.test(name)) {
    return res.status(400).send('Le nom du dossier contient des caractères non-alphanumériques');
  }

  if (fs.statSync(paths).isDirectory()) {
    // Si c'est un dossier, utiliser rmdirSync pour le supprimer ainsi que tout ce qu'il contient
    fs.rmdirSync(paths, { recursive: true });
  } else {
    // Sinon, c'est un fichier, utiliser unlinkSync pour le supprimer
    fs.unlinkSync(paths);
  }
  
  // Retourner une réponse 204 No Content
  res.status(204).send();
});

// Méthode DELETE pour supprimer un fichier ou un dossier dans un dossier
// Route HTTP DELETE pour l'URL '/api/drive/:parentFolderName/:name'
app.delete('/api/drive/:parentFolderName/:name', (req, res) => {
  const parentFolderName = req.params.parentFolderName;
  const folderName = req.params.name;
  const paths = path.join(tmpDir, parentFolderName, folderName);

  const regExp = /[^a-zA-Z0-9]/g;
  if (regExp.test(folderName)) {
    return res.status(400).send('Le nom du dossier contient des caractères non-alphanumériques');
  }

  if (!fs.existsSync(paths)) {
    return res.status(404).send('Le dossier/fichier n\'existe pas');
  }

  if (fs.statSync(paths).isDirectory()) {
    // Si c'est un dossier, utiliser rmdirSync pour le supprimer
    fs.rmdirSync(paths, { recursive: true });
  } else {
    // Sinon, c'est un fichier, utiliser unlinkSync pour le supprimer
    fs.unlinkSync(paths);
  }
  
  // Retourner une réponse 204 No Content
  res.status(204).send();
});

// Méthode PUT pour supprimer un fichier ou un dossier dans un dossier
// Route HTTP PUT pour l'URL '/api/drive'
app.put('/api/drive', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Aucun fichier trouvé dans la requête');
  }

  return res.status(201).send('Fichier uploadé avec succès');
});

// Méthode PUT pour supprimer un fichier ou un dossier dans un dossier
// Route HTTP PUT pour l'URL '/api/drive/:parentFolderName'
// Le middleware upload.single('file') est ajouté à la route et indique a Multer de ne récupérer qu'un seul fichier dans la requete 
// ainsi que ses infos(comme son nom)
app.put('/api/drive/:parentFolderName', uploadParent.single('file'), (req, res) => {
  const parentFolderName = req.params.parentFolderName;
  const parentFolderPath = path.join(tmpDir, parentFolderName);

  if (!req.file) {
    return res.status(400).send('Aucun fichier trouvé dans la requête');
  }

  if (!fs.existsSync(parentFolderPath)) {
    return res.status(404).send('Le dossier/fichier n\'existe pas');
  }

  return res.status(201).send('Fichier uploadé avec succès');
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
})